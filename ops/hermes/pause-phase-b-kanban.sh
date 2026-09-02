#!/usr/bin/env bash
set -Eeuo pipefail

PROFILE="socialolla-phase-b"
PROFILE_BIN="/home/hermes/.local/bin/${PROFILE}"
PROFILE_HOME="/home/hermes/.hermes/profiles/${PROFILE}"
PIDFILE="${PROFILE_HOME}/kanban-phase-b.pid"

fail() {
  printf 'PHASE_B_PAUSE=BLOCKED\nREASON=%s\n' "$1" >&2
  exit 1
}

[[ "$(id -u)" -eq 0 ]] || fail "RUN_AS_ROOT_REQUIRED_FOR_RUNUSER"
[[ -x "$PROFILE_BIN" ]] || fail "PROFILE_ALIAS_NOT_FOUND:${PROFILE_BIN}"

printf 'STEP=PAUSE_DEDICATED_PROFILE\n'
runuser -u hermes -- "$PROFILE_BIN" pause || true

printf 'STEP=STOP_STANDALONE_DISPATCHER\n'
if [[ -f "$PIDFILE" ]]; then
  PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null; then
    kill -TERM "$PID" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      kill -0 "$PID" 2>/dev/null || break
      sleep 1
    done
  fi
  if [[ ! "$PID" =~ ^[0-9]+$ ]] || ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PIDFILE"
  fi
fi

printf 'PHASE_B_PAUSE=REQUESTED\n'
printf 'NEW_DISPATCH=PAUSED\n'
printf 'IMPORTANT=An already-running Kanban worker is not force-killed by this helper. It may continue until its current run exits or reaches its configured runtime limit.\n'
printf 'RESUME=Re-run bootstrap-phase-b-kanban.sh after reviewing current task state.\n'
