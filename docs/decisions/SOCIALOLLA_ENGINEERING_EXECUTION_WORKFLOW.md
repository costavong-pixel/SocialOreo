# SocialOlla Engineering Execution Workflow

**Decision date:** 2026-08-03  
**Status:** Confirmed owner direction  
**Applies to:** SocialOlla roadmap coordination PR #5 and subsequent implementation milestones

## Core workflow

Engineering work for SocialOlla must use a bounded preflight and checkpointed execution model until the current milestone is complete.

- Every meaningful coding run begins with the available `/saveruflo` preflight or the repository's equivalent read-only safety preflight.
- The run must identify the exact repository, branch, objective, acceptance criteria, protected boundaries, current state, and stop conditions before changing code.
- Work proceeds through explicit LangGraph-style states and resumable checkpoints rather than one long unstructured agent session.
- Small tasks are grouped into milestone-sized delivery units so the project does not create one pull request per minor change.
- The workflow must remain honest about tool availability. An agent may not claim that `/saveruflo`, LangGraph, a worker, browser, deployment, or provider call was used unless that capability actually ran and produced evidence.

## LangGraph-style checkpoint model

Each milestone should maintain a durable state record with these stages:

```text
PREPARE
-> PREFLIGHT
-> AUDIT_CURRENT_STATE
-> PLAN
-> IMPLEMENT_BOUNDED_CHECKPOINT
-> RUN_FOCUSED_TESTS
-> INDEPENDENT_REVIEW
-> FIX_AND_RETEST
-> FULL_REGRESSION
-> MILESTONE_ACCEPTANCE
-> READY_FOR_OWNER_REVIEW
```

A failed or interrupted run resumes from the last proven checkpoint. It does not silently skip failed tests or restart with a different objective.

Each checkpoint records:

- milestone and checkpoint ID;
- exact repository, branch, base SHA, and current head SHA;
- files and modules in scope;
- acceptance criteria;
- completed changes;
- tests and evidence;
- unresolved risks or blockers;
- next permitted action;
- rollback or restore point.

## Pull-request reduction rule

Default GitHub structure:

- one long-lived implementation branch per approved milestone;
- one draft pull request per milestone, opened when useful for visibility or review;
- multiple clear commits and checkpoint updates inside that milestone PR;
- no separate PR for every route, component, test, copy change, or small fix;
- the milestone PR becomes ready only after exact-head tests, required reviews, rollback evidence, and milestone acceptance pass.

A separate PR is allowed only when isolation is genuinely safer, including:

- urgent security fixes;
- independent production hotfixes;
- migrations that require a separate reversible deployment order;
- changes owned by a different repository that cannot be safely staged in the same PR;
- a checkpoint whose risk or review size would make the milestone PR unsafe.

Reducing PR count must not create an unreviewable giant change. The branch must remain divided into bounded commits and checkpoint evidence.

## Builder and reviewer separation

Where the execution environment supports multiple agents or workers:

- builders implement bounded checkpoints;
- independent reviewers verify scope, behavior, isolation, security, migration, rollback, and tests;
- reviewers should not approve their own unverified claims;
- disagreements or uncertainty stop progression until resolved or escalated to the owner.

The exact number of agents depends on available tooling and task size. The workflow must not invent workers that did not run.

## Milestone protections

Until the milestone reaches owner review:

- no production deployment;
- no live OAuth or provider credentials unless the milestone explicitly authorizes a controlled test;
- no payment charge or customer migration;
- no DNS or destructive infrastructure change;
- no merge to `main` without the required gate and owner-approved process;
- no removal of old services or rollback paths;
- no duplicate publishing path or second source of truth.

## Approved Milestone 1

**Owner approval:** 2026-08-03

Milestone 1 will produce a staging-ready unified SocialOlla foundation that proves:

- exact post-PR #4 audits of SocialOreo and Content Factory;
- final module reuse map and architecture decision;
- canonical identity, workspace, destination, entitlement, credit, and audit contracts;
- Content Factory Post integration path;
- SocialOreo Watch integration path;
- conversational profile onboarding and connection-first flow;
- one destination-specific first post and seven-day plan;
- safe provider-disabled or sandboxed Instagram/TikTok connection boundaries;
- unified assistant orchestration contract;
- multilingual locale, assistant, profile, Post, Watch, notification, and support contracts with Unicode, mixed-language, and right-to-left acceptance coverage;
- focused and full regression coverage;
- migration, dual-run, deployment, and rollback plan.

This milestone is staging and integration proof. It does not automatically authorize production launch, real customer migration, or public payment collection.

## Chat and coordination limitation

The SocialOlla project chat can record decisions, inspect connected repository evidence, and prepare implementation instructions. It does not itself expose `/saveruflo` or LangGraph as executable tools. Those requirements must be enforced in the coding environment or agent that actually implements the milestone. No status report may say those tools ran without corresponding evidence.
