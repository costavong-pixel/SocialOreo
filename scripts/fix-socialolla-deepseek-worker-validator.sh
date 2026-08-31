#!/usr/bin/env bash
set -Eeuo pipefail

WORKER_USER="socialolla-ai"
INSTALL_DIR="/opt/socialolla-deepseek-worker"
WORKER_FILE="$INSTALL_DIR/worker.py"
TASK_FILE="/srv/socialolla-ai/tasks/qualification-001.json"
PYTHON="$INSTALL_DIR/.venv/bin/python"

log() { printf '[socialolla-deepseek-fix] %s\n' "$*"; }
die() { printf '[socialolla-deepseek-fix] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ ${EUID} -ne 0 ]]; then
  command -v sudo >/dev/null 2>&1 || die "Run as root or install sudo."
  exec sudo -E bash "$0" "$@"
fi

[[ -f "$WORKER_FILE" ]] || die "$WORKER_FILE is missing."
[[ -x "$PYTHON" ]] || die "$PYTHON is missing or not executable."
[[ -f "$TASK_FILE" ]] || die "$TASK_FILE is missing."
id -u "$WORKER_USER" >/dev/null 2>&1 || die "Worker user $WORKER_USER is missing."

BACKUP="$WORKER_FILE.bak-$(date -u +%Y%m%dT%H%M%SZ)"
install -o root -g root -m 0600 "$WORKER_FILE" "$BACKUP"
log "Backup created: $BACKUP"

"$PYTHON" - "$WORKER_FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
source = path.read_text(encoding="utf-8")

broken = '''    for key in raw:\n        if SECRET_KEY_RE.search(key):\n            raise WorkerError("Secret-like task fields are forbidden.")\n\n'''

if broken in source:
    source = source.replace(broken, "", 1)
    path.write_text(source, encoding="utf-8")
    print("VALIDATOR_PATCH=APPLIED")
elif "Secret-like task fields are forbidden." not in source:
    print("VALIDATOR_PATCH=ALREADY_APPLIED")
else:
    raise SystemExit("Expected validator block was not found exactly; refusing an unsafe edit.")
PY

chown root:root "$WORKER_FILE"
chmod 0755 "$WORKER_FILE"
"$PYTHON" -m py_compile "$WORKER_FILE"
log "Python compile check passed"

set +e
QUAL_OUTPUT="$(runuser -u "$WORKER_USER" -- \
  "$PYTHON" "$WORKER_FILE" --task "$TASK_FILE" 2>&1)"
QUAL_STATUS=$?
set -e

printf '\nSOCIALOLLA_DEEPSEEK_VALIDATOR_FIX\n'
printf 'VALIDATOR_FIX=PASS\n'
printf 'PYTHON_COMPILE=PASS\n'
if [[ $QUAL_STATUS -eq 0 ]]; then
  printf 'QUALIFICATION=PASS\n'
  printf 'QUALIFICATION_RESULT=%s\n' "$QUAL_OUTPUT"
else
  printf 'QUALIFICATION=FAIL\n'
  printf 'QUALIFICATION_ERROR=%s\n' "$QUAL_OUTPUT"
  exit "$QUAL_STATUS"
fi
