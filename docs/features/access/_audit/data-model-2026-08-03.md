# Data-model audit — access — 2026-08-03

## Outcome

- Model: [`../data-model.md`](../data-model.md)
- Staged migration: [`../migrations/01-create-access-schema.ts`](../migrations/01-create-access-schema.ts)
- Live schema changed: no
- Live migration directory changed: no

## Architecture and conventions detected

- PostgreSQL and TypeORM are mandatory; TypeORM entities and specialized concrete repositories
  live under `apps/server/src/shared/domain`, while feature/domain mapping stays above repositories.
- Runtime synchronization is disabled in both `apps/server/src/shared/database/typeorm.options.ts`
  and `apps/server/src/shared/database/data-source.ts`.
- Application-generated UUID primary keys, snake-case names, explicit named constraints,
  `timestamptz` audit columns, and reviewed reversible migration classes are established by the
  auth schema.
- Production migrations are timestamped in `apps/server/migrations`; design-stage migrations stay
  feature-local until implementation.

## Staged migration and safety

`01-create-access-schema.ts` creates `warehouses`, `permissions`, `roles`, `role_permissions`, and
`warehouse_memberships`, then seeds the nine specification-defined Permission identifiers. Its
`down` drops the dependent tables in reverse order, including the catalogue rows. No live
migration, runtime synchronization change, concurrent index, non-transactional operation, user
seed, or real-looking PII is introduced.

The migration assumes the already-tracked auth schema exists. The feature SAD explicitly approves
the precondition that no existing production Users need a membership backfill. Deployment must
verify the User table is empty before promotion. A non-empty result blocks this staged migration:
implementation then needs an explicit expand/backfill/contract migration and a product decision
for each existing User's Warehouse and Role. No live database was introspected and no local
environment-value file was read.

## Constraint and concurrency decisions

- A one-to-one membership table is used instead of nullable columns on `users`.
- Composite foreign keys make cross-Warehouse Role assignment impossible and carry Role/Permission
  classifications into join tables without a trigger.
- Partial unique indexes enforce at most one protected Role and at most one manager assignment per
  Warehouse. PostgreSQL cannot require at least one child row; registration provisioning, domain
  lifecycle rules, Warehouse-row locking, integration tests, and reconciliation cover that half.
- Reserved Permissions are database-excluded from custom Roles. Release-specific completeness of
  manager grants remains an explicit catalogue-migration and reconciliation responsibility.
- Manager transfer and assigned-Role deletion lock the Warehouse row first, giving all access
  lifecycle mutations one serialization order.
- `COLLATE "C"` gives exact bytewise, case-sensitive Role-name uniqueness without Unicode
  normalization. Server grapheme segmentation remains authoritative for the 100-character limit.

## Drift report

| Surface                   | Repository evidence                                 | Designed model                                    | Drift                                                                                         |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Tables/entities           | Auth `accounts`, `users`, `sessions` only           | Five new access tables                            | Expected new schema; matching TypeORM entities do not exist yet.                              |
| Columns/types/nullability | UUID and explicit `timestamptz` auth conventions    | UUID access identities; explicit non-null columns | Entity implementation must match names, classifications, collation, and composite-key fields. |
| Relations/constraints     | Explicit named FKs/checks/uniques in auth migration | Composite same-Warehouse and classification FKs   | Expected feature delta; no existing access relations conflict.                                |
| Indexes                   | Query-backed auth unique/FK indexes                 | Nine access indexes/constraints                   | Expected feature delta; each index is tied to a SAD/AC query or composite FK.                 |
| Catalogue data            | No Permission seed                                  | Nine migration-owned system Permissions           | Expected new system vocabulary; labels and kinds must stay migration-managed.                 |
| Migrations                | One live timestamped auth migration                 | One reversible feature-local migration            | Promote later with repository timestamp naming; do not generate into the live tree now.       |

## Validation record

- TypeScript migration syntax/type compatibility: passed with TypeScript 5.9.3 against the
  server's installed TypeORM types using a temporary validation-only project file (removed after
  the check).
- Mermaid: structural validation passed (one `erDiagram`, five declared entities, all six
  relationship endpoints declared); `mmdc` is not installed locally, so rendered validation was
  unavailable.
- Reversibility: static inspection passed; dependent membership and join tables drop before Roles,
  Permissions, and Warehouses.
- Foreign-key indexes: covered by primary/unique indexes or explicit Role/membership indexes.
- System adherence: PostgreSQL/TypeORM only; no Mongoose artifact, runtime synchronization, live
  migration, persistence leakage, telemetry, or credential-file access introduced.

## Unresolved decisions and gates

- Deployment must prove there are no existing Users before promoting the migration. A non-empty
  User table requires a replacement rollout and an explicit backfill decision.
- The API stage must choose list bounds/pagination and deterministic response shapes before the
  250 ms Role-read target can be validated.
- UI implementation tasks remain gated on explicit approval of `design-handoff.md`, as stated by
  the feature SAD.
