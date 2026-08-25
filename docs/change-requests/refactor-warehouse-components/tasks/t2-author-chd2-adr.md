---
id: T2
title: "Author CH-D2's system ADR — the narrowed placement rule"
layer: 'docs'
deps: []
acs: ['CR-AC-03']
files_hint: ['docs/system/adr']
source_refs: ['docs/system/adr/14-08-2026-domain-owned-flat-modules.md']
owner: 'YuriiH'
estimate: 'L'
status: 'done'
---

# T2 — Author CH-D2's system ADR — the narrowed placement rule

## Why

[`spec.md` CR-AC-03](../spec.md#cr-ac-03-cr-us-01-ch-d1ch-d4ch-d6--the-rule-is-stated) fixes this ADR's content; [`sad.md` §4.1](../sad.md#41-the-rule-is-narrowed-by-one-clause-and-the-guides-are-reconciled-to-that-clause), §4.2 and §4.5 extend it. It is the deliverable every later task's placement rests on, which is why [`sad.md` §4.7](../sad.md#47-documentation-lands-before-the-code-it-governs) puts it at step 0.

## What

Write `docs/system/adr/<date>-<title>.md` in the repository's existing MADR shape, `Accepted`. It must state:

- **The narrowing.** ADR 14-08's owning-entity rule stays the default; where a slice's **sole** consumer exercises its capabilities at another scope, placement follows the scope of exercise. Everything else ADR 14-08 decides — flat modules, one entity per top-level module, no nested submodules, declared public surfaces — is preserved.
- **The answer to "organize by consumer".** Concede the rejection holds for _nesting a module under a screen_, which this request does not do, and that it does not reach a tiebreak between two existing flat modules. Do not deny that the basis is a consumer argument.
- **No domain asymmetry.** Record the `domain-expert` `ESCALATION_REQUIRED` finding and that the canonical glossaries refuse the cross-cutting-capability vs. subordinate-entity distinction; state that the access tabs stay put on a placement decision, not a domain one.
- **The home-vs-grouping test** (`sad.md` §4.2): a directory is a module's _home_ when it has module identity — a name in the module list, a surface entry, and its own `route.tsx`/`page.tsx`. A directory with none of those is a component grouping.
- **The naming rule** (`sad.md` §4.5): a directory or namespace names the domain its contents address, not the module that renders them — covering `warehouse.json`, `shared/api/warehouse/` and `workspace-administration/warehouses/` in one sentence.

## Definition of Done

- [ ] the ADR reads `Accepted` and is reachable from `docs/system/adr/`
- [ ] all five clauses above are present and each is stated as a rule, not as a justification of this one move
- [ ] the tiebreak's two conditions (sole consumer; different scope of exercise) are both written as import-graph facts, so risk R6's over-application is checkable
- [ ] no clause asserts a domain asymmetry the glossaries refuse
- [ ] the file passes the repository's markdown lint

## Notes

**Hard rule (`sad.md` R6):** the tiebreak must be falsifiable by a scan. A rule a contributor cannot apply to a new entity without re-deciding per case is the third bullet of `change.md` §6's abort threshold.

Do **not** create a feature ADR under `tasks/../adr/` — [`sad.md` §9](../sad.md#9-adr-index) records that no decision of this design clears the blast-radius gate, and CH-D2 is a _system_ ADR delivered by this request.
