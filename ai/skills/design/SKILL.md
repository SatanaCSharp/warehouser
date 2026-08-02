---
name: design
model-tier: reasoning
reasoning-effort: high
workers: [explorer, critic]
description: Create or update a feature architecture from an approved specification while applying the durable architecture in docs/system. Use for architecture design, feature SADs, system placement, module boundaries, runtime design, target surfaces, and /design. Writes docs/features/{slug}/sad.md and only creates feature ADRs for consequential feature-specific decisions.
---

# Feature architecture design

Resolve the input per [`../_shared/work-item.md`](../_shared/work-item.md). A bare slug preserves
the existing feature flow. For `change-request:<slug>`, use `docs/change-requests/<slug>` as the
artifact root, read `change.md` with `spec.md`, and describe current versus target behavior plus
retained/modified/removed building blocks. Never create a feature directory for the request. All
feature-root paths below mean the resolved `work_item_root`.

Apply the system architecture to one feature. `docs/system` owns durable repository rules; the
feature SAD records how the feature fits those rules, not a competing architecture.

## Inputs

- `docs/features/<slug>/spec.md` (required).
- `docs/system/sad.md`, `docs/system/architecture-map.md`, relevant focused architecture documents,
  guides, and Accepted system ADRs (required).
- Existing feature artifacts and the closest implementation precedents.

## Protocol

1. Read system documentation before designing. Separate current implementation, accepted target
   state, and open system decisions.
2. Derive `target_surfaces` from the specification and architecture map using
   [`../_shared/surfaces.md`](../_shared/surfaces.md).
3. Map each capability to an existing container/module and dependency direction. Prefer the
   documented extension points; do not invent a second framework, state owner, persistence model,
   validation strategy, or UI system.
4. Write `docs/features/<slug>/sad.md` with frontmatter and these stable sections:
   1. Context and quality goals
   2. Constraints inherited from `docs/system`
   3. Scope and target surfaces
   4. Solution strategy
   5. Building blocks and ownership
   6. Runtime view
   7. Data and interface impact
   8. Cross-cutting concerns
   9. ADR index
   10. Verification strategy
   11. Risks and open questions
5. Link inherited rules instead of copying them. Cite the exact system document for every important
   boundary and explicitly record any proposed deviation.
6. Run the blast-radius check in [`references/blast-radius.md`](references/blast-radius.md). Create
   an ADR from [`templates/adr.md`](templates/adr.md) only for a decision that passes it. A feature
   with no ADR-worthy decision is valid and records `None` in §9.
7. For UI surfaces, route to `design-ui` for the visual approval gate. For other surfaces, route to
   sequences/data-model/API as applicable, then tasks.
8. Re-read the feature SAD and system sources. Reject contradictions, undocumented technologies,
   invented containers, and claims that planned infrastructure already exists.

## Definition of Done

- The feature SAD traces every building block to a system boundary or labels an approved deviation.
- `target_surfaces` is explicit and downstream-routing compatible.
- Feature-specific decisions and inherited system decisions are clearly separated.
- ADR count may be zero; every created ADR passes the blast-radius gate and appears in §9.
