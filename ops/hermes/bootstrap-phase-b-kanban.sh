#!/usr/bin/env bash
set -Eeuo pipefail

# SocialOlla Phase B Hermes launcher.
# Creates an isolated Hermes profile + a durable, dependency-gated Kanban chain
# for GitHub Issue #25. It intentionally does NOT use --oneshot for real work,
# --goal, --yolo, auto-merge, production access, live providers, payments, or
# DNS changes.

HERMES_BIN="/home/hermes/.local/bin/hermes"
EXPECTED_HERMES_HOST="slab-prompt-ola"
EXPECTED_HERMES_VERSION="0.20.6"
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
TASK_MANIFEST_FILE="${PROFILE_HOME}/phase-b-task-manifest"
LOGFILE="${PROFILE_HOME}/logs/phase-b-kanban-daemon.log"
DEEPSEEK_USAGE="${PROFILE_HOME}/logs/phase-b-deepseek-probe.json"

fail() {
  printf 'PHASE_B_HERMES_BOOTSTRAP=BLOCKED\nREASON=%s\n' "$1" >&2
  exit 1
}

[[ "$(id -u)" -eq 0 ]] || fail "RUN_AS_ROOT_REQUIRED_FOR_RUNUSER"
[[ -x "$HERMES_BIN" ]] || fail "HERMES_BINARY_NOT_FOUND:${HERMES_BIN}"
command -v python3 >/dev/null 2>&1 || fail "PYTHON3_NOT_FOUND"

SHORT_HOST="$(hostname -s 2>/dev/null || hostname)"
[[ "$SHORT_HOST" == "$EXPECTED_HERMES_HOST" ]] || fail "WRONG_HERMES_HOST:${SHORT_HOST}"

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

extract_task_id() {
  python3 -c '
import json, re, sys
text = sys.stdin.read()
# Prefer a JSON object from the end, while tolerating a human warning line
# before a --json receipt.
for line in reversed([x.strip() for x in text.splitlines() if x.strip()]):
    try:
        d = json.loads(line)
    except Exception:
        continue
    if isinstance(d, dict):
        if isinstance(d.get("task"), dict) and d["task"].get("id"):
            print(d["task"]["id"]); raise SystemExit(0)
        if d.get("id"):
            print(d["id"]); raise SystemExit(0)
        if d.get("task_id"):
            print(d["task_id"]); raise SystemExit(0)
m = re.search(r"\bt_[A-Za-z0-9_-]+\b", text)
if m:
    print(m.group(0)); raise SystemExit(0)
raise SystemExit(2)
'
}

extract_task_status() {
  python3 -c '
import json, sys
text = sys.stdin.read()
for line in reversed([x.strip() for x in text.splitlines() if x.strip()]):
    try:
        d = json.loads(line)
    except Exception:
        continue
    if isinstance(d, dict) and isinstance(d.get("task"), dict):
        d = d["task"]
    if isinstance(d, dict) and d.get("status"):
        print(d["status"]); raise SystemExit(0)
raise SystemExit(2)
'
}

printf 'STEP=HERMES_VERSION\n'
HERMES_VERSION_RAW="$(hr --version)" || fail "HERMES_VERSION_FAILED"
printf '%s\n' "$HERMES_VERSION_RAW"
printf '%s\n' "$HERMES_VERSION_RAW" | grep -Fq "$EXPECTED_HERMES_VERSION" \
  || fail "UNEXPECTED_HERMES_VERSION:${HERMES_VERSION_RAW}"

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
MODEL_CONFIG="$(pr config get model --json 2>/dev/null || true)"
MODEL_EVIDENCE="${MODEL_CONFIG}\n${PROFILE_INFO}"
printf '%s\n' "$MODEL_EVIDENCE" | grep -Eqi 'gpt[- ]?5\.6.*luna|luna.*gpt[- ]?5\.6' \
  || fail "MAIN_MODEL_NOT_GPT_5_6_LUNA"
printf 'PROFILE_MAIN_MODEL_CHECK=PASS\n'

printf 'STEP=CONFIGURE_DEEPSEEK_DELEGATION\n'
# delegate_task routing is configured under delegation.*.
pr config set delegation.provider deepseek >/dev/null
pr config set delegation.model deepseek-v4-flash >/dev/null
pr config set delegation.max_concurrent_children 1 >/dev/null
# Serialize the explicit Phase B dependency chain. Auto-decomposition is off;
# normal parent->child promotion remains on.
pr config set kanban.max_in_progress 1 >/dev/null
pr config set kanban.max_in_progress_per_profile 1 >/dev/null
pr config set kanban.auto_decompose false >/dev/null
pr config set kanban.auto_promote_children true >/dev/null
# Human/owner review remains the completion gate.
pr config set kanban.review_dispatch false >/dev/null
# This dedicated profile uses the standalone dispatcher, never a gateway one.
pr config set kanban.dispatch_in_gateway false >/dev/null

mkdir -p "$(dirname "$LOGFILE")"
chown -R hermes:hermes "${PROFILE_HOME}/logs"

printf 'STEP=DEEPSEEK_MINIMAL_PROBE\n'
# --safe-mode + --oneshot are ONLY for this literal no-tools provider smoke.
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
    --description "Durable staging-acceptance chain for GitHub Issue #25; owner review before live providers."
fi

printf 'STEP=VERIFY_PROFILE_WORKER_LANE\n'
ASSIGNEES_JSON="$(pr kanban --board "$BOARD" assignees --json 2>/dev/null || true)"
printf '%s' "$ASSIGNEES_JSON" | grep -Fq "$PROFILE" \
  || fail "KANBAN_PROFILE_NOT_SPAWNABLE:${PROFILE}"

printf 'STEP=LOAD_ISSUE_25\n'
ISSUE_JSON="$(http_json "$ISSUE_API")" || fail "GITHUB_ISSUE_LOOKUP_FAILED"
ISSUE_STATE="$(printf '%s' "$ISSUE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["state"])')"
[[ "$ISSUE_STATE" == "open" ]] || fail "ISSUE_25_NOT_OPEN"
ISSUE_BODY="$(printf '%s' "$ISSUE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["body"])')"
[[ -n "$ISSUE_BODY" ]] || fail "ISSUE_25_BODY_EMPTY"

COMMON_BODY=$(cat <<EOF
AUTHORITATIVE_TASK_SOURCE: https://github.com/${REPO}/issues/${ISSUE_NUMBER}
AUTHORITATIVE_BASE_AT_BOOTSTRAP: ${EXPECTED_MAIN}

NON-NEGOTIABLE EXECUTION CONTRACT:
- Read GitHub Issue #25 before acting and obey its complete Phase B scope/boundaries.
- Re-check remote SocialOreo main at the start of this card. If it differs from ${EXPECTED_MAIN} and no owner-approved successor is recorded on Issue #25, BLOCK as MAIN_MOVED.
- Main/coordinator is GPT-5.6 Luna. Use delegate_task for bounded implementation/forensic subtasks; delegation is pinned to DeepSeek/deepseek-v4-flash.
- Do NOT silently use GPT-5.3 Codex Spark. Codex UI is not a dependency.
- Scratch workspace only. Do not mutate a pre-existing local project checkout. Clone/prepare isolated source in this card's workspace when needed.
- Never print/store/post credentials, env secret values, tokens, cookies, raw Auth0 subjects, customer data, or full secret-bearing logs.
- Source changes: codex/* branch + Draft PR only. Never merge or enable auto-merge.
- No production deployment/DB/data writes, no DNS, no live Meta/Instagram/TikTok publish, no live/paid Apify/Bright Data/social-data capture, no real Square payment/refund.
- Before any staging write, prove it is staging and preserve/consume the prior card's rollback evidence.
- Heartbeat during long operations. Post a concise sanitized checkpoint comment to GitHub Issue #25 at the end of this card when GitHub credentials permit.
- If human login/approval, new credentials, production access, live-provider effects, payment effects, DNS changes, or security-boundary weakening would be required, BLOCK with OWNER_GATE_REQUIRED rather than improvising.
- On success, kanban_complete with a concise summary + structured metadata (SHAs/revisions, tests, side-effect counts, rollback pointer as applicable). On a real blocker, kanban_block with the exact reason. Do not plain-text-exit a running card.
EOF
)

create_card() {
  local code="$1"
  local title="$2"
  local parent_id="$3"
  local specific_body="$4"
  local key="socialolla-phase-b-${ISSUE_NUMBER}-${code}"
  local body="${COMMON_BODY}

CARD_ID: ${code}
CARD_SCOPE:
${specific_body}"
  local -a args
  args=(kanban --board "$BOARD" create "$title"
        --body "$body"
        --assignee "$PROFILE"
        --workspace scratch
        --priority 1
        --idempotency-key "$key"
        --max-runtime 4h
        --max-retries 2
        --json)
  if [[ -n "$parent_id" ]]; then
    args+=(--parent "$parent_id")
  fi
  local receipt id
  receipt="$(pr "${args[@]}")" || fail "KANBAN_CREATE_FAILED:${code}"
  id="$(printf '%s' "$receipt" | extract_task_id)" || fail "KANBAN_TASK_ID_UNPARSEABLE:${code}"
  printf '%s' "$id"
}

printf 'STEP=CREATE_OR_REUSE_PHASE_B_CHAIN\n'
B01="$(create_card B01 \
  'B01 Phase B preflight and staging inventory' \
  '' \
  "Read the full authoritative Issue #25 body embedded below. Verify remote source/base, make a fresh isolated clone, inspect current-main Phase B/runtime docs, verify existing SocialOlla staging server identity and safe SSH reachability read-only, record pre-change staging service/revision/environment/worker state, and check whether an existing staging Auth0/browser session can be reused without asking the owner to login. No staging write in B01. If staging identity/access is ambiguous, block before B02.

FULL_ISSUE_25:\n${ISSUE_BODY}")"

B02="$(create_card B02 \
  'B02 Backup rollback exact-release and DB staging qualification' \
  "$B01" \
  'Using B01 handoff, create/verify a staging-only pre-change backup or rollback pointer BEFORE any write. Qualify/deploy the exact approved release to staging only when safe; verify staging DB migrations/schema compatibility and health/release identity. Keep all social/Watch/payment providers disabled. Do not touch production. If a source defect is required to proceed, create a bounded codex/* Draft PR with tests, comment Issue #25, and BLOCK for owner review instead of merging it yourself.')"

B03="$(create_card B03 \
  'B03 Normal USER Auth0 canonical journey and Issue 11' \
  "$B02" \
  'Against the exact qualified staging release, run normal USER authenticated acceptance for Home, Profile, Posts, Watch, Calendar, Connections, Credits, Analysis, Assistant, Settings, account identity visibility and canonical navigation. Reproduce/check GitHub Issue #11 Auth0 callback behavior. Reuse existing valid session first. If a fresh owner login is genuinely required, BLOCK with the exact login requirement. If code is required, Draft PR + tests + owner gate; no self-merge.')"

B04="$(create_card B04 \
  'B04 Provider-disabled Post customer and durable-job acceptance' \
  "$B03" \
  'Prove the customer-reachable provider-disabled Post flow: create/edit, platform variant, schedule/job state, cancel/reschedule/retry/idempotency/reconciliation as applicable, truthful UI/evidence and zero live provider calls. Do not treat mock/provider-disabled state as Published. Exercise relevant tests/runtime evidence without real Instagram/TikTok effects.')"

B05="$(create_card B05 \
  'B05 Provider-disabled Watch credit and durable-run acceptance' \
  "$B04" \
  'Prove the customer-reachable provider-disabled Watch flow: create/schedule/run/persist/report, failure/refund/retry/idempotency/lease behavior, exact credit lifecycle evidence and truthful UI. Paid/live Watch provider calls must remain zero. Do not display a real Captured result from fixtures/provider-disabled execution.')"

B06="$(create_card B06 \
  'B06 Staging Post and Watch worker service qualification' \
  "$B05" \
  'Using the preserved rollback evidence, install/qualify staging-only Post and Watch worker services/timers only as required for Phase B. Provider-enabled configuration remains OFF. Prove status, dry-run/provider-disabled behavior, restart/recovery, no double execution, and exact release identity. No production services.')"

B07="$(create_card B07 \
  'B07 Browser mobile keyboard and truthful failure acceptance' \
  "$B06" \
  'Run browser acceptance against the actual staging application, including desktop, practical mobile viewport, canonical navigation, keyboard/focus path for the core journey, and truthful error/failure states. Capture screenshots/visual evidence only if tooling really supports it. Do not claim browser/screenshot acceptance without actual evidence.')"

B08="$(create_card B08 \
  'B08 Phase B final evidence and owner review gate' \
  "$B07" \
  'Aggregate parent handoffs, GitHub Issue #25 checkpoints, exact source/staging revisions, backup/rollback pointer, USER/browser/Post/Watch/worker results, tests/CI if source changed, Issue #11 disposition, and side-effect counts. Re-verify live social-provider calls=0, paid Watch-provider calls=0, real payments/refunds=0, real publishing=0, production mutations=0, DNS changes=0. If every Phase B criterion passes, leave a final sanitized Issue #25 report ending PHASE_B_PASS and move this card to human review with kanban_request_review. If not, report PHASE_B_BLOCKED and block with the exact remaining blocker. Never proceed into Phase C.')"

cat > "$TASK_MANIFEST_FILE" <<EOF
B01=${B01}
B02=${B02}
B03=${B03}
B04=${B04}
B05=${B05}
B06=${B06}
B07=${B07}
B08=${B08}
EOF
chown hermes:hermes "$TASK_MANIFEST_FILE"
chmod 600 "$TASK_MANIFEST_FILE"

printf 'PHASE_B_CHAIN=%s,%s,%s,%s,%s,%s,%s,%s\n' "$B01" "$B02" "$B03" "$B04" "$B05" "$B06" "$B07" "$B08"

printf 'STEP=CHECK_CHAIN_STATE\n'
ANY_RUNNING=0
ANY_REVIEW=0
ANY_BLOCKED=0
ALL_TERMINAL=1
for pair in \
  "B01:$B01" "B02:$B02" "B03:$B03" "B04:$B04" \
  "B05:$B05" "B06:$B06" "B07:$B07" "B08:$B08"; do
  code="${pair%%:*}"
  id="${pair#*:}"
  show="$(pr kanban --board "$BOARD" show "$id" --json 2>/dev/null || true)"
  [[ -n "$show" ]] || fail "KANBAN_TASK_SHOW_FAILED:${code}"
  status="$(printf '%s' "$show" | extract_task_status)" || fail "KANBAN_TASK_STATUS_UNPARSEABLE:${code}"
  printf '%s_STATUS=%s\n' "$code" "$status"
  case "$status" in
    running) ANY_RUNNING=1; ALL_TERMINAL=0 ;;
    review)  ANY_REVIEW=1; ALL_TERMINAL=0 ;;
    blocked) ANY_BLOCKED=1; ALL_TERMINAL=0 ;;
    done|archived) ;;
    ready|todo|scheduled) ALL_TERMINAL=0 ;;
    *) fail "UNEXPECTED_KANBAN_STATUS:${code}:${status}" ;;
  esac
done

if [[ "$ANY_REVIEW" -eq 1 ]]; then
  printf 'PHASE_B_HERMES_BOOTSTRAP=OWNER_REVIEW_REQUIRED\n'
  exit 0
fi
if [[ "$ANY_BLOCKED" -eq 1 ]]; then
  fail "PHASE_B_CHAIN_HAS_BLOCKED_CARD_REVIEW_ISSUE_25_AND_STATUS_HELPER"
fi
if [[ "$ALL_TERMINAL" -eq 1 ]]; then
  printf 'PHASE_B_HERMES_BOOTSTRAP=CHAIN_COMPLETE\n'
  exit 0
fi
if [[ "$ANY_RUNNING" -eq 1 ]]; then
  printf 'PHASE_B_HERMES_BOOTSTRAP=ALREADY_RUNNING\n'
  exit 0
fi

printf 'STEP=ENSURE_NO_PROFILE_GATEWAY_DISPATCH\n'
GATEWAY_STATUS="$(pr gateway status 2>&1 || true)"
if printf '%s\n' "$GATEWAY_STATUS" | grep -Eqi 'status:[[:space:]]*(running|active)|gateway[[:space:]]+(is[[:space:]]+)?(running|active)'; then
  fail "PROFILE_GATEWAY_ALREADY_RUNNING_STOP_IT_BEFORE_STANDALONE_DISPATCH"
fi

printf 'STEP=LIFT_DEDICATED_PROFILE_PAUSE\n'
pr resume >/dev/null 2>&1 || true

printf 'STEP=DISPATCH_PREFLIGHT_DRY_RUN\n'
pr kanban --board "$BOARD" dispatch --dry-run --max 1 >/dev/null \
  || fail "KANBAN_DISPATCH_DRY_RUN_FAILED"

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
  # v0.20.6 standalone daemon is the bounded headless escape hatch. This
  # dedicated profile does not run a messaging gateway and has embedded
  # gateway dispatch disabled. Never run two dispatchers for this profile.
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
printf 'PROFILE=%s\nBOARD=%s\nDISPATCHER_PID=%s\nLOG=%s\nMANIFEST=%s\n' \
  "$PROFILE" "$BOARD" "$PID" "$LOGFILE" "$TASK_MANIFEST_FILE"
printf 'OWNER_REVIEW_REQUIRED_BEFORE_LIVE_PROVIDER=YES\n'
