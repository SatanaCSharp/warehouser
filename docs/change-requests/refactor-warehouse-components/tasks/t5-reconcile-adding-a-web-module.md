---
id: T5
title: 'Reconcile `adding-a-web-module.md` at its four contradicting statements'
layer: 'docs'
deps: ['T2']
acs: ['CR-AC-03']
files_hint: ['docs/system/guides/adding-a-web-module.md']
source_refs: ['docs/system/guides/adding-a-web-module.md']
owner: 'YuriiH'
estimate: 'M'
status: 'done'
---

# T5 — Reconcile `adding-a-web-module.md` at its four contradicting statements

## Why

CH-D4, and the reason [`spec.md` CR-AC-03](../spec.md#cr-ac-03-cr-us-01-ch-d1ch-d4ch-d6--the-rule-is-stated) was amended before this breakdown (`sad.md` §11 O1). Three of the four locations were already enumerated; the flatness paragraph is the one a conforming implementation could otherwise have left contradicting CH-D2.

## What

Four edits, all in `docs/system/guides/adding-a-web-module.md`:

1. **§1's cross-scope sentence** — "a capability exercised at several scopes lives in one module … never in a second module" — gains CH-D2's sole-consumer carve-out.
2. **§1's flatness paragraph** — "a second domain entity never acquires a home inside another module's tree" — gains `sad.md` §4.2's home-vs-grouping test, so _home_ means module identity (module list entry, surface entry, own `route.tsx`/`page.tsx`) rather than a directory name mentioning another entity.
3. **§1's closing pointer**, which routes the reader to ADR 14-08 as the governing decision, now routes to CH-D2.
4. **§"Common failures"** first bullet, which currently names _"Warehouse administration under `modules/workspace/` because a Workspace contains Warehouses"_ — i.e. this request's outcome — as a failure. Restate it so the failure is placement by containment **without** a sole-consumer scan, not this arrangement.

Preserve §1's existing rule that a module needing a submodule should be promoted to a flat top-level sibling — `spec.md` §3 depends on it for future in-Warehouse entities.

## Definition of Done

- [ ] all four locations are edited, and a grep for the four quoted phrases returns either nothing or the reconciled wording
- [ ] the guide's promotion rule (submodule → flat top-level sibling) is retained verbatim
- [ ] reading §1 and §"Common failures" end to end produces no statement a contributor could use to reject the T7 layout
- [ ] the file passes the repository's markdown lint

## Notes

This is the task [`test-plan.md` §Review gates](../test-plan.md#review-gates) singles out: _"that `adding-a-web-module.md` retains **no** statement contradicting the new ADR, at **four** locations, not three"_. The reviewer reads the whole guide, not only the four diffs — a fifth contradicting statement found at review is a finding against this task, not a new request.
