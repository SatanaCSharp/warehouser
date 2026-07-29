---
name: survey
model-tier: reasoning
reasoning-effort: high
workers: [explorer]
description: Survey a repository and create or refresh the evidence-backed system architecture map under docs/system. Use for codebase surveys, architecture inventories, stale architecture documentation, greenfield foundations, and /survey. Records current implementation separately from accepted target architecture.
---

# System architecture survey

Maintain `docs/system/architecture-map.md` as the factual map of the repository. Durable decisions
belong in `docs/system/sad.md` and `docs/system/adr/`; feature design belongs in
`docs/features/<slug>/`.

## Protocol

1. Read repository instructions, manifests, existing `docs/system`, and accepted system ADRs.
2. Detect brownfield versus greenfield. In brownfield mode, inspect code/config and cite evidence.
   In greenfield mode, confirm the foundational stack and record accepted cross-cutting decisions
   in system ADRs before describing the target baseline.
3. Inventory containers, packages/modules, runtime entry points, dependency direction, datastores,
   contracts, migrations, test/build commands, frontend foundations, and representative precedents.
4. Separate three states explicitly: implemented now, accepted target, and undecided/proposed.
   Never present an installed dependency as wired infrastructure.
5. Update `docs/system/architecture-map.md`; reconcile affected links or summaries in
   `docs/system/sad.md` without duplicating detailed prose.
6. Record machine-readable build/test/lint/migration metadata only when backed by repository
   evidence. Validate diagrams and every cited path.
7. Stamp the reflected commit when the worktree state permits it; otherwise note that the map
   reflects an uncommitted working tree.
8. Hand off feature work to `specify`; hand off system-document maintenance to `system-docs`.

## Definition of Done

- `docs/system/architecture-map.md` matches code/config and distinguishes current from target state.
- Durable architecture remains under `docs/system`; no competing root `docs/architecture-map.md` is
  created.
- Every convention and infrastructure claim has a valid evidence anchor.

## References

- [`./templates/architecture-map.md`](./templates/architecture-map.md)
- [`../_shared/mermaid-check.md`](../_shared/mermaid-check.md)
- [`../_shared/self-check.md`](../_shared/self-check.md)
- [`../_shared/handoff.md`](../_shared/handoff.md)
