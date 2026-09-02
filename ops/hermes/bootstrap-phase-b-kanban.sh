#!/usr/bin/env bash
set -Eeuo pipefail

# SocialOlla Phase B Hermes launcher.
# Creates an isolated Hermes profile + durable Kanban task for GitHub Issue #25.
# It intentionally does NOT use --oneshot for the real job, --yolo, auto-merge,
# production access, live providers, payments, or DNS changes.

HERMES_BIN="/home/hermes/.local/bin/hermes"
PROFILE="socialolla-phase-b"
PROFILE_BIN="/home/hermes/.local/bin/${PROFILE}"
BOARD="socialolla-phase-b"
REPO="costavong-pixel/SocialOreo"
ISSUE_NUMBER="25"
EXPECTED_MAIN="45387435fc70f86777bde1c25366977bac58bcbd"
ISSUE_API="https://api.github.com/repos/${REPO}/issues/${ISSUE_NUMBER}"
BRANCH_API="https://api.github.com/repos/${REPO}/branches/main"
PROFILE_HOME="/home/hermes/.hermes/profiles/${PROFILE}"
PIDFILE="${PROFILE_HOME}/kanban-phase-b.pid"
TASK_ID_FILE="${PROFILE_HOME}/phase-b-task-id"
LOGFILE="${PROFILE_HOME}/logs/phase-b-kanban-daemon.log"
DEEPSEEK_USAGE="${PROFILE_HOME}/logs/phase-b-deepseek-probe.json"
TASK_KEY="socialolla-phase-b-issue-${ISSUE_NUMBER}"

fail() {
  printf 'PHASE_B_HERMES_BOOTSTRAP=BLOCKED\nREASON=%s\n' "$1" >&2
  exit 1
}

[[ "$(id -u)" -eq 0 ]] || fail "RUN_AS_ROOT_REQUIRED_FOR_RUNUSER"
[[ -x "$HERMES_BIN" ]] || fail "HERMES_BINARY_NOT_FOUND:${HERMES_BIN}"
command -v python3 >/dev/null 2>&1 || fail "PYTHON3_NOT_FOUND"

hr() {
  runuser -u hermes -- "$HERMES_BIN" "$@"
}

pr() {
  [[ -x "$PROFILE_BIN" ]] || fail "PROFILE_ALIAS_NOT_FOUND:${PROFILE_BIN}"
  runuser -u hermes -- "$PROFILE_BIN" "$@"
}

http_json() {
  python3 - "$1" <<'PY'
import json, sys, urllib.request
url = sys.argv[1]
req = urllib.request.Request(url, headers={"User-Agent": "socialolla-hermes-bootstrap/1.0"})
with urllib.request.urlopen(req, timeout=20) as r:
    data = r.read().decode("utf-8")
json.loads(data)
print(data)
PY
}

printf 'STEP=HERMES_VERSION\n'
hr --version

printf 'STEP=VERIFY_REMOTE_MAIN\n'
BRANCH_JSON="$(http_json "$BRANCH_API")" || fail "GITHUB_MAIN_LOOKUP_FAILED"
REMOTE_MAIN="$(printf '%s' "$BRANCH_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["commit"]["sha"])')"
[[ "$REMOTE_MAIN" == "$EXPECTED_MAIN" ]] || fail "MAIN_MOVED:${REMOTE_MAIN}"
printf 'REMOTE_MAIN=%s\n' "$REMOTE_MAIN"

printf 'STEP=ENSURE_ISOLATED_PROFILE\n'
if ! hr profile show "$PROFILE" >/dev/null 2>&1; then
  hr profile create "$PROFILE" \
    --clone \
    --clone-from default \
    --description "SocialOlla Phase B staging qualification coordinator. Bounded to GitHub Issue #25; no production, live provider effects, real payments, DNS changes, or self-merge."
fi
[[ -x "$PROFILE_BIN" ]] || fail "PROFILE_CREATED_BUT_ALIAS_MISSING"

PROFILE_INFO="$(hr profile show "$PROFILE")" || fail "PROFILE_SHOW_FAILED"
MAIN_MODEL_LINE="$(printf '%s\n' "$PROFILE_INFO" | awk 'tolower($0) ~ /^[[:space:]]*model:/ {print; exit}')"
printf 'PROFILE_MODEL=%s\n' "${MAIN_MODEL_LINE:-UNKNOWN}"
printf '%s\n' "$MAIN_MODEL_LINE" | grep -Eqi 'gpt[- ]?5\.6.*luna|luna.*gpt[- ]?5\.6' \
  || fail "MAIN_MODEL_NOT_GPT_5_6_LUNA"

printf 'STEP=CONFIGURE_DEEPSEEK_DELEGATION\n'
# Hermes delegate_task routing is configured under delegation.*, not auxiliary.*.
pr config set delegation.provider deepseek >/dev/null
pr config set delegation.model deepseek-v4-flash >/dev/null
pr config set delegation.max_concurrent_children 1 >/dev/null
# One durable Phase B worker at a time on this dedicated board/profile.
pr config set kanban.max_in_progress 1 >/dev/null
pr config set kanban.max_in_progress_per_profile 1 >/dev/null
pr config set kanban.auto_promote_children false >/dev/null
# Human/owner review remains the completion gate. Do not let a review worker
# review the implementation worker automatically.
pr config set kanban.review_dispatch false >/dev/null
# This profile uses the dedicated standalone Kanban dispatcher below. Keeping
# gateway dispatch disabled prevents a future profile gateway from double-claiming.
pr config set kanban.dispatch_in_gateway false >/dev/null

mkdir -p "$(dirname "$LOGFILE")"
chown -R hermes:hermes "${PROFILE_HOME}/logs"

printf 'STEP=DEEPSEEK_MINIMAL_PROBE\n'
# --safe-mode is used ONLY for this no-tools provider smoke probe. It must not
# be used for the real task because it disables config/rules/skills.
PROBE="$(runuser -u hermes -- "$PROFILE_BIN" \
  --safe-mode \
  --provider deepseek \
  --model deepseek-v4-flash \
  --oneshot 'Reply exactly with: DEEPSEEK_OK' \
  --usage-file "$DEEPSEEK_USAGE")" || fail "DEEPSEEK_PROBE_FAILED"
[[ "$PROBE" == "DEEPSEEK_OK" ]] || fail "DEEPSEEK_PROBE_UNEXPECTED_RESPONSE"
printf 'DEEPSEEK_PROBE=PASS\n'

printf 'STEP=ENSURE_KANBAN_BOARD\n'
BOARDS_JSON="$(pr kanban boards list --json 2>/dev/null || true)"
if ! printf '%s' "$BOARDS_JSON" | grep -q "\"${BOARD}\""; then
  pr kanban boards create "$BOARD" \
    --name "SocialOlla Phase B" \
    --description "Durable staging-acceptance execution for GitHub Issue #25; owner review before live providers."
fi

printf 'STEP=LOAD_ISSUE_25\n'
ISSUE_JSON="$(http_json "$ISSUE_API")" || fail "GITHUB_ISSUE_LOOKUP_FAILED"
ISSUE_STATE="$(printf '%s' "$ISSUE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])')"
[[ "$ISSUE_STATE" == "open" ]] || fail "ISSUE_25_NOT_OPEN"
ISSUE_BODY="$(printf '%s' "$ISSUE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["body"])')"
[[ -n "$ISSUE_BODY" ]] || fail "ISSUE_25_BODY_EMPTY"

TASK_BODY=$(cat <<EOF
AUTHORITATIVE_TASK_SOURCE: https://github.com/${REPO}/issues/${ISSUE_NUMBER}
AUTHORITATIVE_MAIN_AT_LAUNCH: ${EXPECTED_MAIN}

Read the complete task below before any action. Treat it as the bounded owner-approved Phase B scope.

EXECUTION MODEL FOR THIS RUN:
- Main/coordinator model must remain GPT-5.6 Luna (bootstrap already verified this before dispatch).
- Use delegate_task for bounded implementation/forensic subtasks; this dedicated profile pins delegation.provider=deepseek and delegation.model=deepseek-v4-flash.
- Verify any pre-existing isolated /opt/socialolla-deepseek-worker path before using it; never assume it exists.
- Do NOT silently fall back to GPT-5.3 Codex Spark. If DeepSeek is unavailable, record the blocker and let Luna decide only whether a small coordinator-level diagnostic can continue safely.
- Do not use Codex UI as a dependency.

WORKSPACE BOOTSTRAP:
- The Kanban task starts in an isolated scratch workspace. Do not modify an existing project checkout just to begin the task.
- Verify Git/GitHub access without printing credentials. Clone ${REPO} into the scratch workspace or create another isolated checkout there, verify main is exactly ${EXPECTED_MAIN}, and work from that evidence.
- If a source fix is required, create a codex/* branch from the verified base and a Draft PR. Push only the bounded fix and evidence.
- Verify SocialOlla staging server identity and existing SSH access before any remote write. Do not request or print secrets. If safe existing access is unavailable, mark the staging step BLOCKED rather than inventing access.

DURABLE PROGRESS:
- After each major Phase B gate, append a concise, sanitized progress comment to GitHub Issue #25 when existing GitHub credentials permit it. Include gate/status, relevant exact SHA/revision, test/result summary, and blocker if any. Never post tokens, env values, cookies, raw Auth0 subjects, customer data, or full logs.
- Also use Kanban comments/heartbeats during long operations so the task survives context/process interruptions.

KANBAN/HUMAN GATE:
- Work until the Phase B evidence is complete or a protected blocker is reached.
- Never merge or enable auto-merge.
- When work is ready for owner review, request review / leave the task in review. Do not self-review or mark owner approval on your own.
- Maintain bounded checkpoints/heartbeats during long operations.

${ISSUE_BODY}
EOF
)

printf 'STEP=CREATE_OR_REUSE_TASK\n'
TASK_JSON="$(pr kanban --board "$BOARD" create \
  "SocialOlla Phase B exact-main staging acceptance" \
  --body "$TASK_BODY" \
  --assignee "$PROFILE" \
  --workspace scratch \
  --priority 1 \
  --idempotency-key "$TASK_KEY" \
  --max-runtime 12h \
  --max-retries 2 \
  --json)" || fail "KANBAN_TASK_CREATE_FAILED"
TASK_ID="$(printf '%s' "$TASK_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or d.get("task_id") or "")' 2>/dev/null || true)"
if [[ -z "$TASK_ID" ]]; then
  # At task creation time there is no running claim yet, so v0.20.6 list --json
  # is safe from the known active-claim banner issue. Use it only as fallback.
  LIST_JSON="$(pr kanban --board "$BOARD" list --json)" || fail "KANBAN_LIST_FAILED"
  TASK_ID="$(printf '%s' "$LIST_JSON" | python3 -c '
import json, sys
key = sys.argv[1]
d = json.load(sys.stdin)
items = d if isinstance(d, list) else d.get("tasks", [])
for x in items:
    if x.get("idempotency_key") == key or x.get("title") == "SocialOlla Phase B exact-main staging acceptance":
        print(x.get("id", ""))
        break
' "$TASK_KEY")"
fi
[[ -n "$TASK_ID" ]] || fail "KANBAN_TASK_ID_NOT_FOUND"
printf '%s\n' "$TASK_ID" > "$TASK_ID_FILE"
chown hermes:hermes "$TASK_ID_FILE"
chmod 600 "$TASK_ID_FILE"
printf 'KANBAN_TASK_ID=%s\n' "$TASK_ID"

printf 'STEP=ENSURE_NO_PROFILE_GATEWAY_DISPATCH\n'
GATEWAY_STATUS="$(pr gateway status 2>&1 || true)"
if printf '%s\n' "$GATEWAY_STATUS" | grep -Eqi 'status:[[:space:]]*(running|active)|gateway[[:space:]]+(is[[:space:]]+)?(running|active)'; then
  fail "PROFILE_GATEWAY_ALREADY_RUNNING_STOP_IT_BEFORE_STANDALONE_DISPATCH"
fi

printf 'STEP=LIFT_DEDICATED_PROFILE_PAUSE\n'
# This profile is dedicated to Phase B. If the safe stop helper paused it on a
# previous attempt, lift that pause before starting the dispatcher.
pr resume >/dev/null 2>&1 || true

printf 'STEP=START_DURABLE_DISPATCHER\n'
if [[ -f "$PIDFILE" ]]; then
  OLD_PID="$(cat "$PIDFILE" 2>/dev/null || true)"
  if [[ "$OLD_PID" =~ ^[0-9]+$ ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    printf 'KANBAN_DISPATCHER=ALREADY_RUNNING\nPID=%s\n' "$OLD_PID"
  else
    rm -f "$PIDFILE"
  fi
fi

if [[ ! -f "$PIDFILE" ]]; then
  # Hermes v0.20.6 still supports the standalone Kanban daemon as a headless
  # escape hatch. It is used here because this isolated profile does not run a
  # messaging gateway. Do not also start a dispatcher-enabled gateway for this
  # profile while this daemon is active.
  runuser -u hermes -- bash -c \
    "nohup '$PROFILE_BIN' kanban --board '$BOARD' daemon --force --failure-limit 2 --pidfile '$PIDFILE' >'$LOGFILE' 2>&1 </dev/null &"
  sleep 2
fi

[[ -f "$PIDFILE" ]] || fail "KANBAN_DISPATCHER_PIDFILE_NOT_CREATED"
PID="$(cat "$PIDFILE" 2>/dev/null || true)"
[[ "$PID" =~ ^[0-9]+$ ]] && kill -0 "$PID" 2>/dev/null || fail "KANBAN_DISPATCHER_NOT_RUNNING"

printf 'STEP=FINAL_STATUS\n'
pr kanban --board "$BOARD" stats || true
printf 'PHASE_B_HERMES_BOOTSTRAP=STARTED\n'
printf 'PROFILE=%s\nBOARD=%s\nTASK_ID=%s\nDISPATCHER_PID=%s\nLOG=%s\n' \
  "$PROFILE" "$BOARD" "$TASK_ID" "$PID" "$LOGFILE"
printf 'OWNER_REVIEW_REQUIRED_BEFORE_LIVE_PROVIDER=YES\n'
