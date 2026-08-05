PROJECT: SocialOlla
TASK: M3 staging-readiness planning
THREAD: socialolla-m3-staging-readiness
CONTROL: real LangGraph + real Ruflo + real /saveruflo
STOP: M3_PLAN_OWNER_REVIEW_GATE

AUTHORITATIVE BASELINES

SocialOreo origin/main:
736f7dda608660bc735cb05f490e2e89771fcb81

Content Factory origin/main:
61788d02815ce3f8173df456df79025347167698

M2 evidence archive:
/home/debian/backups/socialolla-m2-evidence-20260804.tar.gz

SHA-256:
eb0c370772893e334822fb192d443d6269982212a5eb2087630f8d251aa734b5

PR #77 and all associated work must remain untouched.

PURPOSE

1. Investigate the cf-audit worktree with 289 pre-existing staged deletions.
2. Produce an implementation-ready M3 staging plan.
3. Use a real multi-agent inspect -> reconcile -> review -> fix-plan loop.
4. Do not deploy or write product code.

CONTROL LAYERS

LangGraph is the workflow source of truth:
- nodes
- conditional edges
- durable checkpoints
- findings
- retries
- final gate

Ruflo is the agent-execution layer:
- spawn agents
- assign tasks
- shared memory
- concurrency
- status
- handoffs
- termination

/saveruflo is the safety preflight:
- task start
- before sensitive inspection
- before any possible mutation
- before final report

Ruflo must not advance LangGraph by itself. The active LangGraph coordinator
advances nodes only after checking evidence and required reviews.

VERIFY REAL RUFLO

Before delegation:

- command -v ruflo
- ruflo --version
- ruflo --help
- ruflo doctor, when available
- inspect available Ruflo MCP tools/resources
- inspect any local /ruflo skill
- verify agent spawning, swarm coordination, and shared memory

Record the actual version, tools, config, agent IDs, swarm ID, and commands used.

Do not install or upgrade Ruflo automatically.
Do not claim Ruflo ran when only normal subagents ran.
If full Ruflo is unavailable, create RUFLO-BLOCKER-001 and state the exact owner
action needed.

AGENT TEAM

Use no more than 12 roles and no more than 4 concurrent workers.

1. Coordinator A / Loop Engineer
   - owns LangGraph execution
   - assigns agents
   - reconciles findings
   - loops until the plan is complete
   - cannot approve its own plan

2. Coordinator B / Independent Gatekeeper
   - read-only
   - challenges assumptions and evidence
   - validates graph integrity and final readiness
   - returns GO / GO_WITH_CONDITIONS / BLOCK

3. Ruflo Swarm Monitor
   - creates the swarm
   - assigns bounded work
   - prevents overlap
   - manages memory namespaces
   - terminates completed agents
   - makes no architecture decisions

4. CF-Audit Forensic Inspector
   - identifies exact path/repo/branch/HEAD/upstream
   - inspects staged deletions and uniqueness
   - compares against main, branches, and PRs
   - returns KEEP / ARCHIVE / SAFE_TO_REMOVE / OWNER_REVIEW_REQUIRED
   - makes no changes

5. SocialOreo Repository Inspector
   - startup/build/runtime
   - Prisma/migrations
   - Auth0
   - Square sandbox
   - provider-disable controls
   - health/logging/jobs
   - staging gaps

6. Content Factory Repository Inspector
   - FastAPI startup
   - internal API binding/HMAC
   - health/docs gating
   - provider-disabled behavior
   - logs/process management
   - staging gaps

7. Infrastructure Inspector
   - Caddy
   - PM2
   - Docker
   - ports
   - domains
   - service ownership
   - staging isolation
   - TLS/logs/resources

8. Database and Rollback Inspector
   - PostgreSQL 5432/5433
   - DB ownership
   - migration history
   - staging DB design
   - backup/restore
   - migration failure recovery
   - retention

9. Security, Secrets and Network Inspector
   - env names and locations
   - file permissions
   - Auth0 isolation
   - Square sandbox isolation
   - internal API exposure
   - HMAC rotation
   - log redaction
   - guest/admin boundaries
   - provider-disable enforcement
   - never reveal secret values

10. Product, Browser and Acceptance Inspector
   - deployed staging journey
   - Playwright scenarios
   - exact fixtures
   - screenshots/evidence
   - pass/fail criteria
   - mobile/a11y/RTL
   - restart/idempotency

11. Operations, Monitoring and Cost Inspector
   - capacity
   - backups
   - logs
   - health checks
   - alerts
   - operational ownership
   - incremental cost
   - effort estimate

12. Red-Team Reviewer
   - receives the reconciled draft plan
   - attacks hidden production coupling, unsafe migration, missing rollback,
     exposed internal API, secret leakage, provider/payment escape paths,
     weak browser acceptance, and unsupported cost assumptions
   - returns numbered findings and GO / BLOCK
   - cannot edit the primary plan

RUFLO MEMORY

Use bounded namespaces:

socialolla/m3/baselines
socialolla/m3/cf-audit
socialolla/m3/socialoreo
socialolla/m3/content-factory
socialolla/m3/infrastructure
socialolla/m3/database
socialolla/m3/security
socialolla/m3/product
socialolla/m3/operations-cost
socialolla/m3/findings
socialolla/m3/reviews

Store concise evidence, paths, SHAs, decisions, open findings, handoffs, and
verdicts.

Do not store secret values, raw env files, tokens, cookies, private keys,
chain-of-thought, or large duplicate logs.

LANGGRAPH

START_OR_RESUME
-> LOAD_INSTRUCTIONS
-> SAVERUFLO_INITIAL_PREFLIGHT
-> VERIFY_M2_BASELINES
-> VERIFY_EVIDENCE_ARCHIVE
-> DISCOVER_RUFLO
-> VERIFY_RUFLO_CAPABILITIES
-> SPAWN_COORDINATORS
-> SPAWN_INSPECTOR_SWARM
-> CF_AUDIT_FORENSICS
-> PARALLEL_REPOSITORY_INSPECTIONS
-> PARALLEL_INFRA_DB_SECURITY_INSPECTIONS
-> PRODUCT_ACCEPTANCE_INSPECTION
-> OPERATIONS_COST_INSPECTION
-> RECONCILE_FINDINGS
-> BUILD_M3_GAP_LEDGER
-> SELECT_NEXT_OPEN_FINDING
-> TARGETED_REINSPECTION
-> CLOSE_OR_ESCALATE_FINDING
-> NEXT_FINDING_OR_DRAFT_PLAN
-> DRAFT_M3_PLAN
-> COORDINATOR_B_REVIEW
-> RED_TEAM_REVIEW
-> PLAN_FIX_LOOP
-> FINAL_SPECIALIST_SIGNOFF
-> FINAL_SAVERUFLO_PREFLIGHT
-> FREEZE_PLAN_EVIDENCE
-> M3_PLAN_OWNER_REVIEW_GATE
-> END

CONDITIONAL EDGES

- stale baseline -> VERIFY_M2_BASELINES
- missing Ruflo capability -> RUFLO-BLOCKER-001
- incomplete evidence -> responsible inspector
- conflicting findings -> RECONCILE_FINDINGS
- open critical/high finding -> SELECT_NEXT_OPEN_FINDING
- Coordinator B BLOCK -> PLAN_FIX_LOOP
- Red Team BLOCK -> PLAN_FIX_LOOP
- any mutation or deployment -> SAFETY_BLOCK -> END
- final GO requires no unresolved critical/high planning findings

LOOP ENGINEERING

Repeat:

1. Select highest-risk open finding.
2. Assign one responsible inspector.
3. Require exact evidence.
4. Require independent review.
5. Reconcile disagreement.
6. Update Ruflo memory.
7. Update LangGraph checkpoint.
8. Close, downgrade, or owner-gate the finding.

Continue until:
- all critical/high findings are closed or explicitly owner-gated
- every specialist report exists
- Coordinator B gives GO
- Red Team gives GO
- the plan can be executed without guessing

No agent may approve its own output.

FINDING PREFIXES

FORENSIC-###
ARCH-###
INFRA-###
DB-###
SECURITY-###
PRODUCT-###
OPS-###
COST-###
RUFLO-###
REDTEAM-###

Each finding requires:
- severity
- owner
- exact evidence
- affected path/service
- risk
- required resolution
- acceptance criteria
- owner approval yes/no
- reviewer
- status
- final disposition

CF-AUDIT FORENSICS

The 289 staged deletions are pre-existing.

Required comparisons:
- index vs worktree
- index vs HEAD
- HEAD vs origin/main
- branch vs relevant remotes
- deleted paths vs main
- deleted paths vs open/merged PRs
- unique content detection
- generated/vendor/cache classification
- commit reachability
- unpushed commit detection

Do not reset, restore, stash, commit, clean, checkout, delete, or remove the
worktree.

Return:
- what the deletions represent
- whether the index contains unique recoverable state
- whether an archive/patch is required
- exact safe next action
- final classification

M3 PLAN MUST INCLUDE

1. Target staging architecture
   - staging URLs
   - SocialOreo service
   - private Content Factory service
   - staging PostgreSQL
   - Caddy/PM2 layout
   - file/log locations
   - access control

2. Environment inventory
   - every variable name
   - value owner/source
   - staging/production separation
   - Auth0 callbacks/origins/logout
   - Square sandbox application/location/webhook
   - Content Factory HMAC
   - provider-disabled flags
   - permissions/rotation
   - never include values

3. Database and migrations
   - staging DB creation
   - backup
   - migration command
   - validation
   - fixtures
   - failure handling
   - restore
   - rollback limitations
   - retention

4. Deployment order
   - preflight
   - backup
   - Content Factory
   - internal contract health
   - SocialOreo
   - migration
   - startup
   - smoke checks
   - Playwright acceptance
   - monitoring
   - freeze
   - rollback

5. Security
   - internal API not public
   - no production Square
   - no live OAuth accounts
   - no live providers or publishing
   - no production DB
   - secret redaction
   - admin/tester gates
   - staging restrictions

6. Acceptance
   - exact routes
   - browser scenarios
   - API/contract checks
   - migration checks
   - restart/idempotency
   - mobile/a11y/RTL
   - screenshots/logs
   - pass/fail rules
   - zero-side-effect proof

7. Operations
   - health checks
   - logs
   - alerts
   - backups
   - restore drill
   - restart
   - incident rollback
   - evidence retention

8. Cost and effort
   - confirmed costs
   - estimated incremental costs
   - unknowns
   - person-hour range
   - highest risks
   - implementation slices

9. Owner gates
   - DNS
   - DB creation
   - Caddy
   - PM2
   - secrets
   - Auth0 staging app
   - Square sandbox configuration
   - migrations
   - service startup
   - monitoring
   - any paid service

PROTECTED BOUNDARIES

Do not:
- modify cf-audit
- change repository files
- create branches or PRs
- deploy
- change DNS/Caddy/PM2/Docker/firewall
- start/stop services
- create/drop/migrate databases
- modify env files
- reveal secrets
- enable OAuth/providers/publishing/payments
- use production Square or production data
- change workers/cron
- touch PR #77
- reopen M2
- start M3 implementation

FINAL REPORT

Stop at M3_PLAN_OWNER_REVIEW_GATE and return:

- exact baselines
- evidence archive verification
- LangGraph checkpoint path
- actual Ruflo version/capabilities
- swarm and agent IDs
- assignments/concurrency/memory
- /saveruflo evidence
- cf-audit classification
- all inspector reports
- reconciled findings
- target architecture
- env inventory
- migration/rollback plan
- deployment sequence
- security plan
- browser acceptance plan
- operations/backups/monitoring
- costs and effort
- implementation slices
- exact owner approvals
- Coordinator B verdict
- Red Team verdict
- READY FOR M3 OWNER REVIEW or NOT READY
- exact first owner-approved action

Do not deploy after reporting.
