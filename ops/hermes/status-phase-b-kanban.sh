#!/usr/bin/env bash
set -Eeuo pipefail

PROFILE="socialolla-phase-b"
PROFILE_BIN="/home/hermes/.local/bin/${PROFILE}"
BOARD="socialolla-phase-b"
PROFILE_HOME="/home/hermes/.hermes/profiles/${PROFILE}"
PIDFILE="${PROFILE_HOME}/kanban-phase-b.pid"
TASK_ID_FILE="${PROFILE_HOME}/phase-b-task-id"

fail() {
  printf 'PHASE_B_STATUS=BLOCKED\nREASON=%s\n' "$1" >&2
  exit 1
}

[[ "$(id -u)" -eq 0 ]] || fail "RUN_AS_ROOT_REQUIRED_FOR_RUNUSER"
[[ -x "$PROFILE_BIN" ]] || fail "PROFILE_ALIAS_NOT_FOUND:${PROFILE_BIN}"

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

if [[ -f "$TASK_ID_FILE" ]]; then
  TASK_ID="$(cat "$TASK_ID_FILE" 2>/dev/null || true)"
  printf '\nTASK_ID=%s\n' "$TASK_ID"
  if [[ -n "$TASK_ID" ]]; then
    SHOW_JSON="$(pr kanban --board "$BOARD" show "$TASK_ID" --json 2>/dev/null || true)"
    if [[ -n "$SHOW_JSON" ]]; then
      printf '%s' "$SHOW_JSON" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("TASK_METADATA=UNPARSEABLE")
    raise SystemExit(0)
t = d.get("task", d) if isinstance(d, dict) else {}
for key in ("id", "title", "status", "assignee", "workspace_kind", "branch", "attempts", "max_retries", "created_at", "updated_at"):
    value = t.get(key)
    if value is not None:
        print(f"{key.upper()}={value}")
'
    else
      printf 'TASK_METADATA=UNAVAILABLE\n'
    fi

    printf '\nRECENT_RUNS\n'
    pr kanban --board "$BOARD" runs "$TASK_ID" 2>/dev/null || true
  fi
else
  printf 'TASK_ID=NOT_RECORDED\n'
fi

printf '\nNOTE=Use GitHub Issue_25 comments and any Draft PR as the durable externally-visible progress record.\n'
