---
name: data-model
model-tier: inherit
reasoning-effort: medium
workers: [explorer]
description: Design a feature's PostgreSQL data model and stage reversible TypeORM migrations using the persistence architecture in docs/system. Use for schemas, entities, indexes, constraints, migration design, drift checks, and /data-model. Writes docs/features/{slug}/data-model.md and staged TypeScript migrations without changing the live schema.
---

# Data model

Resolve the input per [`../_shared/work-item.md`](../_shared/work-item.md). A bare slug preserves
the feature flow; `change-request:<slug>` reads and stages everything beneath
`docs/change-requests/<slug>`. For a change request, distinguish new schema from reinterpretation,
backfill, or removal of existing data and make rollback limitations explicit. All feature-root
paths below mean the resolved `work_item_root`.

Project a designed feature onto the repository's PostgreSQL/TypeORM persistence baseline. The
durable rules in `docs/system/server-architecture.md` and `docs/system/sad.md` are authoritative;
feature artifacts may specialize them but may not reintroduce MongoDB/Mongoose or runtime schema
synchronization.

## Inputs

- `docs/features/<slug>/spec.md` and `sad.md` (required).
- `docs/system/sad.md`, `docs/system/architecture-map.md`,
  `docs/system/server-architecture.md`, relevant system ADRs, and existing TypeORM entities and
  migrations (required architecture evidence).
- Feature ADRs and `sad.md §6` runtime flows when present.

## Protocol

1. Read system persistence rules first. Confirm PostgreSQL, TypeORM, repository ports, migrations,
   and `synchronize: false`; stop on a feature proposal that contradicts them without an approved
   system-level decision.
2. Map acceptance criteria and runtime reads/writes to aggregate roots, entities, relations,
   constraints, and query-backed indexes. Follow existing naming, key, audit, and deletion
   conventions; ask only when code and `docs/system` leave a consequential choice open.
3. Write `docs/features/<slug>/data-model.md` from `templates/data-model.md`, including an ER
   diagram, entity/column ownership, constraints, indexes with their serving queries, repository
   boundaries, and explicit links to inherited system rules.
4. Stage TypeORM migration classes under `docs/features/<slug>/migrations/` using feature-local
   ordinal filenames such as `01-create-item.ts`. Each class implements reversible `up` and `down`
   methods using TypeORM's `MigrationInterface` and `QueryRunner`. Do not place design-stage files
   in the live server migration directory.
5. Use safe PostgreSQL evolution: expand/backfill/contract for destructive or new non-null changes;
   index foreign keys; use concurrent indexes where operationally appropriate; keep real-looking
   PII out of seeds. Record transaction requirements when PostgreSQL operations cannot run inside a
   migration transaction.
6. Detect drift between the documented model, TypeORM entities, and existing migrations. Report
   field/column, type, nullability, relation, constraint, and index mismatches. Do not introspect a
   live database when repository evidence is sufficient.
7. Write `docs/features/<slug>/_audit/data-model-<date>.md` listing staged migrations, detected
   conventions, deviations, drift, destructive-change sequencing, and unresolved decisions.
8. Validate Mermaid structure, migration class syntax, reversibility, foreign-key indexes, and
   adherence to `docs/system`. A no-schema-change feature may produce a minimal model and no staged
   migration.
9. Hand off to `api`, or directly to `tasks` when no external contract changes.

## Definition of Done

- The model links to and conforms with system persistence architecture.
- Every schema change has a staged TypeORM migration with reversible `up`/`down` behavior.
- Runtime synchronization is never enabled and no MongoDB/Mongoose artifact is introduced.
- Drift and safety checks are reported with evidence.

## Anti-patterns

- Raw paired `.up.sql`/`.down.sql` files in a TypeORM repository.
- TypeORM decorators in domain entities or repositories returning persistence entities.
- Generating a migration into the live tree during design.
- Inventing indexes without a concrete query.
- Enabling `synchronize` as a substitute for migrations.

## References

- [`./templates/data-model.md`](./templates/data-model.md)
- [`../_shared/surfaces.md`](../_shared/surfaces.md)
- [`../_shared/mermaid-check.md`](../_shared/mermaid-check.md)
- [`../_shared/handoff.md`](../_shared/handoff.md)
