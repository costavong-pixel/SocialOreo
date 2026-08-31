#!/usr/bin/env bash
set -Eeuo pipefail

WORKER_USER="socialolla-ai"
WORKER_GROUP="socialolla-ai"
INSTALL_DIR="/opt/socialolla-deepseek-worker"
DATA_DIR="/srv/socialolla-ai"
ENV_DIR="/etc/socialolla"
ENV_FILE="${ENV_DIR}/deepseek-worker.env"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DEFAULT_MODEL="deepseek-v4-pro"
BASE_URL="https://api.deepseek.com"

log() { printf '[socialolla-deepseek] %s\n' "$*"; }
die() { printf '[socialolla-deepseek] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ ${EUID} -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || die "Run as root or install sudo."
  exec sudo -E bash "$0" "$@"
fi

command -v "$PYTHON_BIN" >/dev/null 2>&1 || die "python3 is required."
command -v getent >/dev/null 2>&1 || die "getent is required."
command -v runuser >/dev/null 2>&1 || die "runuser is required."

log "Creating isolated worker account and directories"
getent group "$WORKER_GROUP" >/dev/null 2>&1 || groupadd --system "$WORKER_GROUP"
id -u "$WORKER_USER" >/dev/null 2>&1 || useradd \
  --system \
  --gid "$WORKER_GROUP" \
  --home-dir "$DATA_DIR" \
  --shell /usr/sbin/nologin \
  "$WORKER_USER"

install -d -o root -g root -m 0755 "$INSTALL_DIR"
install -d -o root -g "$WORKER_GROUP" -m 0750 "$ENV_DIR"
install -d -o "$WORKER_USER" -g "$WORKER_GROUP" -m 0750 \
  "$DATA_DIR" \
  "$DATA_DIR/tasks" \
  "$DATA_DIR/results" \
  "$DATA_DIR/worktree" \
  "$DATA_DIR/logs"

log "Creating standard-library-only Python virtual environment"
if [[ ! -x "$INSTALL_DIR/.venv/bin/python" ]]; then
  if ! "$PYTHON_BIN" -m venv --without-pip "$INSTALL_DIR/.venv"; then
    if command -v apt-get >/dev/null 2>&1; then
      log "Installing python3-venv because the venv module is unavailable"
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq
      apt-get install -y -qq python3-venv
      "$PYTHON_BIN" -m venv --without-pip "$INSTALL_DIR/.venv"
    else
      die "Unable to create a Python virtual environment."
    fi
  fi
fi

cat > "$INSTALL_DIR/worker.py" <<'PY'
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ENV_FILE = Path("/etc/socialolla/deepseek-worker.env")
TASKS_ROOT = Path("/srv/socialolla-ai/tasks").resolve()
RESULTS_ROOT = Path("/srv/socialolla-ai/results").resolve()
WORKTREE_ROOT = Path("/srv/socialolla-ai/worktree").resolve()
LOG_FILE = Path("/srv/socialolla-ai/logs/worker.log")
MAX_TOTAL_SOURCE_BYTES = 1_000_000
MAX_FILE_BYTES = 300_000
TASK_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
ALLOWED_TASK_KEYS = {
    "task_id",
    "expected_behavior",
    "observed_failure",
    "root_cause_evidence",
    "allowed_files",
    "forbidden_files",
    "acceptance_tests",
    "attempt",
    "max_output_tokens",
}
SECRET_KEY_RE = re.compile(
    r"(api[_-]?key|secret|password|token|cookie|authorization|private[_-]?key)",
    re.IGNORECASE,
)


class WorkerError(RuntimeError):
    pass


def log(event: str, **fields: Any) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    safe = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": event,
        **fields,
    }
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(safe, ensure_ascii=True, separators=(",", ":")) + "\n")


def load_env(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise WorkerError(f"Configuration file is missing: {path}")
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise WorkerError("Malformed environment configuration line.")
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def ensure_beneath(path: Path, root: Path, label: str) -> Path:
    resolved = path.resolve(strict=False)
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise WorkerError(f"{label} escapes its allowed root.") from exc
    return resolved


def validate_string_list(value: Any, field: str, *, allow_empty: bool = True) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise WorkerError(f"{field} must be a list of strings.")
    if not allow_empty and not value:
        raise WorkerError(f"{field} must not be empty.")
    return value


def validate_task(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise WorkerError("Task must be a JSON object.")
    unknown = set(raw) - ALLOWED_TASK_KEYS
    if unknown:
        raise WorkerError(f"Unknown task fields: {', '.join(sorted(unknown))}")
    missing = ALLOWED_TASK_KEYS - set(raw)
    if missing:
        raise WorkerError(f"Missing task fields: {', '.join(sorted(missing))}")
    for key in raw:
        if SECRET_KEY_RE.search(key):
            raise WorkerError("Secret-like task fields are forbidden.")

    task_id = raw["task_id"]
    if not isinstance(task_id, str) or not TASK_ID_RE.fullmatch(task_id):
        raise WorkerError("task_id contains unsupported characters.")

    for field in ("expected_behavior", "observed_failure"):
        if not isinstance(raw[field], str) or not raw[field].strip():
            raise WorkerError(f"{field} must be a non-empty string.")

    raw["root_cause_evidence"] = validate_string_list(raw["root_cause_evidence"], "root_cause_evidence")
    raw["allowed_files"] = validate_string_list(raw["allowed_files"], "allowed_files", allow_empty=False)
    raw["forbidden_files"] = validate_string_list(raw["forbidden_files"], "forbidden_files")
    raw["acceptance_tests"] = validate_string_list(raw["acceptance_tests"], "acceptance_tests", allow_empty=False)

    attempt = raw["attempt"]
    if not isinstance(attempt, int) or attempt not in (1, 2):
        raise WorkerError("attempt must be 1 or 2.")

    max_output_tokens = raw["max_output_tokens"]
    if not isinstance(max_output_tokens, int) or not 256 <= max_output_tokens <= 12_000:
        raise WorkerError("max_output_tokens must be between 256 and 12000.")

    return raw


def resolve_source_path(relative: str) -> Path:
    candidate = Path(relative)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise WorkerError(f"Unsafe source path: {relative}")
    resolved = ensure_beneath(WORKTREE_ROOT / candidate, WORKTREE_ROOT, "Source path")
    if resolved.is_symlink():
        raise WorkerError(f"Symlink sources are forbidden: {relative}")
    if not resolved.is_file():
        raise WorkerError(f"Allowed source file does not exist: {relative}")
    return resolved


def read_sources(task: dict[str, Any]) -> list[dict[str, str]]:
    forbidden = set(task["forbidden_files"])
    total = 0
    sources: list[dict[str, str]] = []
    for relative in task["allowed_files"]:
        if relative in forbidden:
            raise WorkerError(f"File is both allowed and forbidden: {relative}")
        path = resolve_source_path(relative)
        size = path.stat().st_size
        if size > MAX_FILE_BYTES:
            raise WorkerError(f"Source file is too large: {relative}")
        total += size
        if total > MAX_TOTAL_SOURCE_BYTES:
            raise WorkerError("Combined source input exceeds the safe limit.")
        sources.append({"path": relative, "content": path.read_text(encoding="utf-8")})
    return sources


def build_prompt(task: dict[str, Any], sources: list[dict[str, str]]) -> str:
    source_blocks = "\n\n".join(
        f"--- FILE: {item['path']} ---\n{item['content']}" for item in sources
    )
    response_contract = {
        "root_cause": "string",
        "patch_summary": "string",
        "files_changed": ["relative/path"],
        "tests_recommended": ["string"],
        "known_limitations": ["string"],
        "security_impact": "string",
        "proposed_commit_message": "string",
        "unified_diff": "unified diff text or empty string",
    }
    return (
        "You are a bounded coding assistant. Analyze only the supplied files. "
        "Do not invent runtime evidence, do not request secrets, and do not propose changes outside allowed_files. "
        "Return one JSON object matching the response contract exactly.\n\n"
        f"TASK ID: {task['task_id']}\n"
        f"EXPECTED BEHAVIOR:\n{task['expected_behavior']}\n\n"
        f"OBSERVED FAILURE:\n{task['observed_failure']}\n\n"
        f"ROOT-CAUSE EVIDENCE:\n{json.dumps(task['root_cause_evidence'], ensure_ascii=False)}\n\n"
        f"ACCEPTANCE TESTS:\n{json.dumps(task['acceptance_tests'], ensure_ascii=False)}\n\n"
        f"ATTEMPT: {task['attempt']}\n\n"
        f"RESPONSE CONTRACT:\n{json.dumps(response_contract, ensure_ascii=False)}\n\n"
        f"SOURCES:\n{source_blocks}\n"
    )


def call_deepseek(config: dict[str, str], task: dict[str, Any], prompt: str) -> tuple[dict[str, Any], dict[str, Any]]:
    api_key = config.get("DEEPSEEK_API_KEY", "")
    model = config.get("DEEPSEEK_MODEL", "")
    base_url = config.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    if not api_key:
        raise WorkerError("DEEPSEEK_API_KEY is absent.")
    if not model:
        raise WorkerError("DEEPSEEK_MODEL is absent.")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Return valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "temperature": 0.1,
        "max_tokens": task["max_output_tokens"],
        "response_format": {"type": "json_object"},
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "socialolla-deepseek-worker/1.0",
        },
    )

    last_error: Exception | None = None
    for retry in range(3):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                body = json.loads(response.read().decode("utf-8"))
            message = body["choices"][0]["message"]["content"]
            if not isinstance(message, str) or not message.strip():
                raise WorkerError("DeepSeek returned an empty response.")
            parsed = json.loads(message)
            if not isinstance(parsed, dict):
                raise WorkerError("DeepSeek response JSON is not an object.")
            return parsed, body.get("usage", {})
        except urllib.error.HTTPError as exc:
            status = exc.code
            if status not in (408, 409, 429, 500, 502, 503, 504):
                raise WorkerError(f"DeepSeek API returned HTTP {status}.") from exc
            last_error = exc
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
        if retry < 2:
            time.sleep(2**retry)
    raise WorkerError(f"DeepSeek API request failed after retries: {type(last_error).__name__}")


def normalize_result(task_id: str, model: str, response: dict[str, Any], usage: dict[str, Any]) -> tuple[dict[str, Any], str]:
    required = {
        "root_cause",
        "patch_summary",
        "files_changed",
        "tests_recommended",
        "known_limitations",
        "security_impact",
        "proposed_commit_message",
        "unified_diff",
    }
    missing = required - set(response)
    if missing:
        raise WorkerError(f"DeepSeek response is missing fields: {', '.join(sorted(missing))}")
    for key in ("root_cause", "patch_summary", "security_impact", "proposed_commit_message", "unified_diff"):
        if not isinstance(response[key], str):
            raise WorkerError(f"DeepSeek response field {key} has the wrong type.")
    for key in ("files_changed", "tests_recommended", "known_limitations"):
        if not isinstance(response[key], list) or not all(isinstance(item, str) for item in response[key]):
            raise WorkerError(f"DeepSeek response field {key} has the wrong type.")

    patch = response["unified_diff"].strip()
    result = {
        "task_id": task_id,
        "status": "proposed_patch" if patch else "analysis_only",
        "model": model,
        "root_cause": response["root_cause"],
        "patch_summary": response["patch_summary"],
        "files_changed": response["files_changed"],
        "tests_recommended": response["tests_recommended"],
        "known_limitations": response["known_limitations"],
        "security_impact": response["security_impact"],
        "proposed_commit_message": response["proposed_commit_message"],
        "ready_for_luna_review": True,
        "usage": {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
        },
    }
    return result, patch


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()

    task_path = Path(args.task)
    if not task_path.is_absolute():
        task_path = TASKS_ROOT / task_path
    task_path = ensure_beneath(task_path, TASKS_ROOT, "Task path")
    if not task_path.is_file():
        raise WorkerError("Task file does not exist.")

    task = validate_task(json.loads(task_path.read_text(encoding="utf-8")))
    sources = read_sources(task)
    log("task_validated", task_id=task["task_id"], files=task["allowed_files"])

    if args.validate_only:
        print(json.dumps({"task_id": task["task_id"], "validation": "PASS"}))
        return 0

    config = load_env(ENV_FILE)
    prompt = build_prompt(task, sources)
    started = time.monotonic()
    response, usage = call_deepseek(config, task, prompt)
    result, patch = normalize_result(task["task_id"], config["DEEPSEEK_MODEL"], response, usage)

    RESULTS_ROOT.mkdir(parents=True, exist_ok=True)
    result_path = RESULTS_ROOT / f"{task['task_id']}.json"
    result_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if patch:
        (RESULTS_ROOT / f"{task['task_id']}.patch").write_text(patch + "\n", encoding="utf-8")

    log(
        "task_completed",
        task_id=task["task_id"],
        model=config["DEEPSEEK_MODEL"],
        elapsed_seconds=round(time.monotonic() - started, 3),
        status=result["status"],
        prompt_tokens=result["usage"]["prompt_tokens"],
        completion_tokens=result["usage"]["completion_tokens"],
    )
    print(json.dumps({
        "task_id": task["task_id"],
        "status": result["status"],
        "result": str(result_path),
        "patch": str(RESULTS_ROOT / f"{task['task_id']}.patch") if patch else None,
    }))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (WorkerError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        log("task_failed", error=type(exc).__name__)
        print(json.dumps({"status": "blocked", "error": str(exc)}), file=sys.stderr)
        raise SystemExit(2)
PY

chmod 0755 "$INSTALL_DIR/worker.py"
chown -R root:root "$INSTALL_DIR"
chmod 0755 "$INSTALL_DIR" "$INSTALL_DIR/.venv" "$INSTALL_DIR/.venv/bin" || true

log "Entering DeepSeek API configuration (input is hidden)"
read -r -s -p "DeepSeek API key: " API_KEY
printf '\n'
read -r -s -p "DeepSeek API key again: " API_KEY_CONFIRM
printf '\n'
[[ -n "$API_KEY" ]] || die "API key cannot be empty."
[[ "$API_KEY" == "$API_KEY_CONFIRM" ]] || die "API key entries do not match."

printf 'Model options:\n  1) deepseek-v4-pro\n  2) deepseek-v4-flash\n'
read -r -p "Choose model [1]: " MODEL_CHOICE
case "${MODEL_CHOICE:-1}" in
  1|deepseek-v4-pro) MODEL="deepseek-v4-pro" ;;
  2|deepseek-v4-flash) MODEL="deepseek-v4-flash" ;;
  *) die "Unsupported model selection." ;;
esac

TMP_ENV="$(mktemp)"
trap 'unset API_KEY API_KEY_CONFIRM; rm -f "${TMP_ENV:-}"' EXIT
umask 077
{
  printf 'DEEPSEEK_API_KEY=%s\n' "$API_KEY"
  printf 'DEEPSEEK_MODEL=%s\n' "$MODEL"
  printf 'DEEPSEEK_BASE_URL=%s\n' "$BASE_URL"
} > "$TMP_ENV"
install -o root -g "$WORKER_GROUP" -m 0640 "$TMP_ENV" "$ENV_FILE"
unset API_KEY API_KEY_CONFIRM

runuser -u "$WORKER_USER" -- test -r "$ENV_FILE" || die "Worker cannot read its protected environment file."

log "Creating harmless qualification fixture and task"
install -d -o "$WORKER_USER" -g "$WORKER_GROUP" -m 0750 "$DATA_DIR/worktree/fixtures"
cat > "$DATA_DIR/worktree/fixtures/add.ts" <<'TS'
export function add(a: number, b: number): number {
  return a - b;
}
TS
cat > "$DATA_DIR/tasks/qualification-001.json" <<'JSON'
{
  "task_id": "qualification-001",
  "expected_behavior": "The add function returns the arithmetic sum of a and b.",
  "observed_failure": "The implementation subtracts b from a.",
  "root_cause_evidence": ["fixtures/add.ts returns a - b"],
  "allowed_files": ["fixtures/add.ts"],
  "forbidden_files": [],
  "acceptance_tests": ["add(2, 3) returns 5", "add(-1, 1) returns 0"],
  "attempt": 1,
  "max_output_tokens": 2000
}
JSON
chown -R "$WORKER_USER:$WORKER_GROUP" "$DATA_DIR/worktree/fixtures" "$DATA_DIR/tasks/qualification-001.json"
chmod 0640 "$DATA_DIR/worktree/fixtures/add.ts" "$DATA_DIR/tasks/qualification-001.json"

log "Running qualification task"
set +e
QUAL_OUTPUT="$(runuser -u "$WORKER_USER" -- \
  "$INSTALL_DIR/.venv/bin/python" "$INSTALL_DIR/worker.py" \
  --task "$DATA_DIR/tasks/qualification-001.json" 2>&1)"
QUAL_STATUS=$?
set -e

printf '\nSOCIALOLLA_SMALL_DEEPSEEK_WORKER_INSTALL\n'
printf 'WORKER_INSTALL=PASS\n'
printf 'WORKER_USER=%s\n' "$WORKER_USER"
printf 'PYTHON=%s\n' "$($INSTALL_DIR/.venv/bin/python --version 2>&1)"
printf 'ENV_FILE=%s\n' "$ENV_FILE"
printf 'API_KEY=PRESENT\n'
printf 'MODEL=%s\n' "$MODEL"
printf 'PUBLIC_PORT=NONE\n'
if [[ $QUAL_STATUS -eq 0 ]]; then
  printf 'QUALIFICATION=PASS\n'
  printf 'QUALIFICATION_RESULT=%s\n' "$QUAL_OUTPUT"
else
  printf 'QUALIFICATION=FAIL\n'
  printf 'QUALIFICATION_ERROR=%s\n' "$QUAL_OUTPUT"
  exit "$QUAL_STATUS"
fi
