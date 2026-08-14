---
id: T3
title: 'Add the domain-owned flat-modules system ADR and both index entries in one commit'
layer: 'docs'
deps: []
acs: ['CR-AC-10']
files_hint:
  - 'docs/system/adr/14-08-2026-domain-owned-flat-modules.md'
  - 'docs/system/web-index.md'
  - 'docs/system/server-index.md'
source_refs: ['CH-D4', 'CH-D5']
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T3 — Add the domain-owned flat-modules system ADR and both index entries

## Why

Seven system ADRs exist and none covers module structure; the layout rule is inferable only from five
documents that each state a different part of it ([CH-D4](../change.md#3-override-map)). This ADR is a
**deliverable** of the request, not a design decision of it — [sad §9](../sad.md#9-adr-index) is explicit
that its content is fixed by [CR-AC-10](../spec.md#cr-ac-10-cr-us-03-ch-d1ch-d6--documentation) and
[sad §4.7](../sad.md#47-flatness-is-a-property-of-module-identity-not-of-directory-depth). It is
authored first because the two guides in T4 point at it.

## What

- Write `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` with status `Accepted`, covering
  **both** applications, following the Context/Decision/Alternatives/Consequences/Links shape of
  `02-08-2026-rtk-query-for-web-api-calls.md`. It states: modules are named for domain entities; one
  entity owns one top-level module; a multi-scope capability stays in one module and carries the views
  for every scope; modules do not nest; cross-module dependencies go through a declared public surface
  and the web composition layer is bound by that rule too, differing in reach not exemption; and
  enforcement primitives, TypeORM entities and repositories stay in `shared/`.
- Use [sad §4.7](../sad.md#47-flatness-is-a-property-of-module-identity-not-of-directory-depth)'s
  **identity-based** formulation of flatness verbatim, naming `modules/auth/`'s route sub-trees as the
  sanctioned example and `modules/workspace/components/workspace-administration/warehouses/` as the
  violation — [sad §11 R6](../sad.md#risks) is why the wording matters.
- Record the singular/plural convention decided in [sad §3](../sad.md#open-questions-closed-here) (web
  singular, server plural) rather than renaming anything.
- Add a "Decisions" entry to **both** `docs/system/web-index.md` and `docs/system/server-index.md`,
  using the "read before…" phrasing the sibling entries use.

## Definition of Done

- [ ] The ADR exists with `Accepted` status and covers both applications.
- [ ] Its Consequences state honestly that cross-module view imports become legal on web, that two
      modules may serve one URL prefix, and that a wrongly-placed module is expensive to move because
      neither application has path aliases.
- [ ] Both indexes carry a pointer to it **in this same commit** — `AGENTS.md` requires a document and
      its index to change together, and [sad §2](../sad.md#2-constraints-inherited-from-docssystem) turns
      that into "CH-D4 and CH-D5 are one commit, never two".
- [ ] A reviewer named in [test-plan.md § Review gates](../test-plan.md#review-gates) confirms the
      consequences clause, which no static check can decide.
- [ ] lint clean.

## Notes

[change.md §6](../change.md#6-rollout) lists index entries as step 7; that ordering is **superseded** by
the `AGENTS.md` same-commit rule, which is why CH-D5 rides here instead. On rollback, this ADR may be
left in place only if marked `Superseded` together with T4's `placing-web-components.md` narrowing —
[change.md §7](../change.md#7-rollback): an Accepted ADR describing a layout the repository does not have
is worse than no ADR.
