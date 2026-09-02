#!/usr/bin/env bash
set -Eeuo pipefail

PROFILE="socialolla-phase-b"
PROFILE_BIN="/home/hermes/.local/bin/${PROFILE}"
BOARD="socialolla-phase-b"
PROFILE_HOME="/home/hermes/.hermes/profiles/${PROFILE}"
PIDFILE="${PROFILE_HOME}/kanban-phase-b.pid"
TASK_MANIFEST_FILE="${PROFILE_HOME}/phase-b-task-manifest"

fail() {
  printf 'PHASE_B_STATUS=BLOCKED\nREASON=%s\n' "$1" >&2
  exit 1
}

[[ "$(id -u)" -eq 0 ]] || fail "RUN_AS_ROOT_REQUIRED_FOR_RUNUSER"
[[ -x "$PROFILE_BIN" ]] || fail "PROFILE_ALIAS_NOT_FOUND:${PROFILE_BIN}"
command -v python3 >/dev/null 2>&1 || fail "PYTHON3_NOT_FOUND"

pr() {
  runuser -u hermes -- "$PROFILE_BIN" "$@"
}

printf 'PHASE_B_STATUS_CHECK\n'
printf 'PROFILE=%s\nBOARD=%s\n' "$PROFILE" "$BOARD"

if [[ -f "$PIDFILE" ]]; then
  PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null; then
    printf 'DISPATCHER=RUNNING\nDISPATCHER_PID=%s\n' "$PID"
  else
    printf 'DISPATCHER=NOT_RUNNING_STALE_PIDFILE\n'
  fi
else
  printf 'DISPATCHER=NOT_RUNNING\n'
fi

printf '\nBOARD_STATS\n'
pr kanban --board "$BOARD" stats || true

[[ -f "$TASK_MANIFEST_FILE" ]] || fail "TASK_MANIFEST_NOT_FOUND"

printf '\nPHASE_B_CHAIN\n'
while IFS='=' read -r CODE TASK_ID; do
  [[ -n "$CODE" && -n "$TASK_ID" ]] || continue
  SHOW_JSON="$(pr kanban --board "$BOARD" show "$TASK_ID" --json 2>/dev/null || true)"
  if [[ -z "$SHOW_JSON" ]]; then
    printf '%s=%s STATUS=UNAVAILABLE\n' "$CODE" "$TASK_ID"
    continue
  fi
  META="$(printf '%s' "$SHOW_JSON" | python3 -c '
import json, sys
text = sys.stdin.read()
d = None
for line in reversed([x.strip() for x in text.splitlines() if x.strip()]):
    try:
        candidate = json.loads(line)
    except Exception:
        continue
    d = candidate
    break
if not isinstance(d, dict):
    print("STATUS=UNPARSEABLE")
    raise SystemExit(0)
t = d.get("task", d) if isinstance(d.get("task", d), dict) else {}
parts=[]
for key in ("status", "assignee", "workspace_kind", "branch_name", "max_retries", "started_at", "completed_at"):
    value=t.get(key)
    if value is not None:
        parts.append(f"{key.upper()}={value}")
print(" ".join(parts) if parts else "STATUS=UNAVAILABLE")
')"
  printf '%s=%s %s\n' "$CODE" "$TASK_ID" "$META"
done < "$TASK_MANIFEST_FILE"

printf '\nACTIVE_OR_BLOCKED_RUN_HISTORY\n'
while IFS='=' read -r CODE TASK_ID; do
  [[ -n "$CODE" && -n "$TASK_ID" ]] || continue
  SHOW_JSON="$(pr kanban --board "$BOARD" show "$TASK_ID" --json 2>/dev/null || true)"
  STATUS="$(printf '%s' "$SHOW_JSON" | python3 -c '
import json, sys
text=sys.stdin.read()
for line in reversed([x.strip() for x in text.splitlines() if x.strip()]):
    try: d=json.loads(line)
    except Exception: continue
    if isinstance(d, dict) and isinstance(d.get("task"), dict): d=d["task"]
    if isinstance(d, dict): print(d.get("status", "")); raise SystemExit(0)
print("")
' 2>/dev/null || true)"
  case "$STATUS" in
    running|blocked|review)
      printf '\n[%s %s %s]\n' "$CODE" "$TASK_ID" "$STATUS"
      pr kanban --board "$BOARD" runs "$TASK_ID" 2>/dev/null || true
      ;;
  esac
done < "$TASK_MANIFEST_FILE"

printf '\nNOTE=GitHub Issue #25 comments and any Draft PR are the durable externally-visible progress record.\n'
