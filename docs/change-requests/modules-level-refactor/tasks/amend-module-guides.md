---
id: T4
title: 'State the ownership rule in the three module guides before any file moves'
layer: 'docs'
deps: ['T3']
acs: ['CR-AC-04', 'CR-AC-10']
files_hint:
  - 'docs/system/guides/adding-a-web-module.md'
  - 'docs/system/guides/adding-a-server-module.md'
  - 'docs/system/guides/placing-web-components.md'
  - 'docs/system/frontend-architecture.md'
source_refs: ['CH-D1', 'CH-D2', 'CH-D3', 'CH-D6']
owner: 'YuriiH'
estimate: 'L'
status: 'todo'
---

# T4 — State the ownership rule in the three module guides before any file moves

## Why

`AGENTS.md` makes `docs/system` the instruction set every contributor and agent reads before
implementing, and two of these documents currently instruct the **opposite** of what this request
approves. [sad §4.6](../sad.md#46-documentation-lands-before-the-code-it-governs) fixes the ordering:
written last, they would document whatever the refactor happened to produce, and
[CR-US-03](../spec.md#cr-us-03-know-the-rule-before-i-place-a-file) promises a contributor that no two
canonical documents disagree _at any point during the rollout_.

## What

- **CH-D1 — `adding-a-web-module.md`:** add a "Choose the owner" section ahead of §1 mirroring the
  server guide: name the module for the domain entity that owns the behavior; extend an existing owner
  rather than adding a second module for the same entity; a capability exercised at several scopes lives
  in one module and carries the views for every scope; modules are flat. Add a cross-module import
  section stating the public-surface rule as an **enumerated per-module declaration**, and that the
  composition layer is bound by it too — differing in reach, not exemption. Add "Common failures"
  entries for placing an entity's code in the module that contains it, and for creating a nested
  submodule.
- **CH-D2 — `adding-a-server-module.md`:** extend §1 with the flat-module rule, the multi-scope
  capability rule and the management-versus-enforcement boundary
  ([CR-RG-06](../spec.md#cr-rg-06--server-authorization-enforcement-and-persistence-stay-in-shared)).
  Extend §"Reuse shared code deliberately" with the rule that error factories, predicates and DTOs are
  module-private and cross a boundary only through an exported use-case module. Add the two
  "Common failures" entries.
- **CH-D3 — `placing-web-components.md` §"When not to nest":** narrow the rule to what it actually
  protects against — reaching into another component's **private tree**. Exempt a module's declared
  public surface: a route owner composing another module's page-level view does not make that view
  shared and does not promote it. Sub-page components keep the existing rule unchanged.
- **CH-D6 (partial) — `frontend-architecture.md`:** qualify the one sentence "keep logic inside one
  module until another module genuinely needs it; promote to `shared/`". Only this sentence moves
  forward; the rest of CH-D6 stays a ship step.
- Every document points at T3's ADR rather than restating the rule a sixth time.

## Definition of Done

- [ ] Both module guides state all four ownership rules; the server guide additionally states the
      management-versus-enforcement boundary and the module-private rule.
- [ ] `placing-web-components.md` no longer forbids T17's cross-module tab import — read literally, it
      previously required `WarehousesTab` be promoted to `shared/components/`, which would put the
      Warehouse domain back outside its module.
- [ ] `frontend-architecture.md`'s promote-to-`shared/` sentence no longer instructs the opposite of
      what T15 does.
- [ ] **No new guide file was created** — the guidance extends the three that exist, which is the same
      rule this request applies to code.
- [ ] The prose clauses are confirmed by the reviewer named in
      [test-plan.md § Review gates](../test-plan.md#review-gates); they carry no test row because no
      static check decides them.
- [ ] lint clean.

## Notes

Hard ordering constraints this task exists to satisfy: **CH-D3 must precede T17** (the shell
composition) and the **`frontend-architecture.md` qualification must precede T15** (the first web
module move), because that is the document a contributor reads before placing the first moved file. The
DAG enforces both by making T14 depend on this task. The remaining `frontend-architecture.md` and all of
`server-architecture.md` reconciliation is deliberately **not** here — it is a ship step
([change.md §8](../change.md#8-canonical-reconciliation-after-pass)).
