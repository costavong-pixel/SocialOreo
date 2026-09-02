# SocialOlla Phase B — Hermes control

This control bundle starts GitHub Issue #25 as a durable dependency-gated Hermes Kanban chain on the dedicated Hermes control host.

It is intentionally separate from SocialOlla product runtime code. It does not merge anything and does not authorize production, live social providers, paid Watch providers, real payments, DNS changes, or Phase C.

## Launch

Run as `root` on the Hermes host `slab-prompt-ola`:

```bash
rm -rf /tmp/socialolla-phase-b-control && \
git clone --depth 1 --branch codex/hermes-phase-b-control https://github.com/costavong-pixel/SocialOreo.git /tmp/socialolla-phase-b-control && \
bash /tmp/socialolla-phase-b-control/ops/hermes/bootstrap-phase-b-kanban.sh
```

The launcher fails closed unless all of these are true:

- host short name is exactly `slab-prompt-ola`;
- Hermes binary exists at `/home/hermes/.local/bin/hermes`;
- installed Hermes reports version `0.20.6`;
- remote SocialOreo `main` is still exactly `45387435fc70f86777bde1c25366977bac58bcbd`;
- an isolated `socialolla-phase-b` profile can be created/cloned;
- that profile still resolves the main model as GPT-5.6 Luna;
- DeepSeek `deepseek-v4-flash` passes a minimal no-tools probe;
- Hermes Kanban recognizes the dedicated profile as a spawnable worker lane;
- GitHub Issue #25 is still open;
- no conflicting dispatcher-enabled gateway is running for this dedicated profile.

The real work does not use `--safe-mode`, `--oneshot`, `--goal`, or `--yolo`. `--safe-mode` + `--oneshot` is used only for the literal `DEEPSEEK_OK` provider smoke probe.

## Durable Phase B chain

The bootstrap creates/reuses eight idempotent cards with explicit parent dependencies:

1. B01 — remote preflight + read-only staging inventory
2. B02 — staging backup/rollback + exact release + DB qualification
3. B03 — normal USER/Auth0 journey + Issue #11
4. B04 — provider-disabled Post acceptance
5. B05 — provider-disabled Watch/credit acceptance
6. B06 — staging Post/Watch worker-service qualification
7. B07 — browser/mobile/keyboard + truthful-failure acceptance
8. B08 — final evidence + owner review gate

Only one Kanban card is allowed to execute at a time. A blocked card prevents later cards from becoming runnable. Each completed parent passes its structured handoff into the next card.

## Status

```bash
bash /tmp/socialolla-phase-b-control/ops/hermes/status-phase-b-kanban.sh
```

The status helper reads each card directly with `kanban show --json`; it does not depend on the v0.20.6 active-claim `kanban list --json` path.

Durable externally visible progress should also appear as sanitized comments on GitHub Issue #25 and, if a source defect is found, in a Draft PR on a `codex/*` branch.

## Safe pause

```bash
bash /tmp/socialolla-phase-b-control/ops/hermes/pause-phase-b-kanban.sh
```

This pauses new Phase B dispatch and stops the standalone dispatcher. It intentionally does not issue a blind `pkill` against an already-running worker. A running attempt may continue until it exits or reaches its configured runtime cap.

After reviewing task state, the bootstrap script can be run again. Every card has its own idempotency key, so rerunning the launcher must not create duplicate Phase B cards.

## Execution limits

- Dedicated profile: `socialolla-phase-b`
- Dedicated board: `socialolla-phase-b`
- Main/coordinator: GPT-5.6 Luna (verified at bootstrap)
- Delegated worker route: DeepSeek / `deepseek-v4-flash`
- Concurrent Kanban cards: 1
- Concurrent delegated children: 1
- Runtime cap: 4 hours per card attempt
- Failure circuit breaker: 2 failed attempts per card (one retry)
- Auto-decomposition: off
- Dependency child promotion: on
- Automatic reviewer dispatch: off
- B08 ends at human/owner review; Phase C is not authorized

## Why not one giant card or goal mode

A giant one-shot card is easier for an agent to stop early and harder to resume cleanly. Goal-mode cards can iterate longer, but we do not need that extra concurrency/state risk for staging mutations. The explicit dependency chain makes every gate durable and prevents later staging actions after a blocker.

## Why standalone Kanban daemon

Hermes now prefers the gateway-embedded dispatcher, but this dedicated profile is deliberately not started as a messaging gateway. The v0.20.6 standalone daemon is therefore used with `--force` as the bounded headless escape hatch. The profile sets `kanban.dispatch_in_gateway=false`, and the launcher refuses to continue if a profile gateway is already running, preventing two dispatchers from racing the same board.
