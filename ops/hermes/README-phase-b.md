# SocialOlla Phase B — Hermes control

This control bundle starts GitHub Issue #25 as a durable Hermes Kanban task on the dedicated Hermes control host.

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
- the task is in a dispatchable state;
- no conflicting dispatcher-enabled gateway is running for this dedicated profile.

The real task does not use `--safe-mode`, `--oneshot`, or `--yolo`. `--safe-mode` + `--oneshot` is used only for the literal `DEEPSEEK_OK` provider smoke probe.

## Status

```bash
bash /tmp/socialolla-phase-b-control/ops/hermes/status-phase-b-kanban.sh
```

Durable externally visible progress should also appear as sanitized comments on GitHub Issue #25 and, if a source defect is found, in a Draft PR on a `codex/*` branch.

## Safe pause

```bash
bash /tmp/socialolla-phase-b-control/ops/hermes/pause-phase-b-kanban.sh
```

This pauses new Phase B dispatch and stops the standalone dispatcher. It intentionally does not issue a blind `pkill` against an already-running worker. A running attempt may continue until it exits or reaches its configured runtime cap.

After reviewing task state, the bootstrap script can be run again. The Kanban task uses an idempotency key, so rerunning the launcher must not create a duplicate Phase B task.

## Execution limits

- Dedicated profile: `socialolla-phase-b`
- Dedicated board: `socialolla-phase-b`
- Main/coordinator: GPT-5.6 Luna (verified at bootstrap)
- Delegated worker route: DeepSeek / `deepseek-v4-flash`
- Concurrent Kanban tasks on this profile: 1
- Concurrent delegated child tasks: 1
- Task runtime cap: 12 hours per attempt
- Failure circuit breaker: 2 failed attempts (one retry)
- Automatic reviewer dispatch: off
- Owner review before live-provider Phase C: required

## Why standalone Kanban daemon

Hermes now prefers the gateway-embedded dispatcher, but this dedicated profile is deliberately not started as a messaging gateway. The v0.20.6 standalone daemon is therefore used with `--force` as the bounded headless escape hatch. The profile sets `kanban.dispatch_in_gateway=false`, and the launcher refuses to continue if a profile gateway is already running, preventing two dispatchers from racing the same board.
