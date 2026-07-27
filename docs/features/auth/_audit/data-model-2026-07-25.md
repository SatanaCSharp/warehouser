# Data-model audit — auth — 2026-07-25

## Outcome

- Model: [`../data-model.md`](../data-model.md)
- Staged migration: [`../migrations/01-create-auth-schema.ts`](../migrations/01-create-auth-schema.ts)
- Live schema changed: no
- Live migration directory changed: no

## Architecture and conventions detected

- PostgreSQL and TypeORM are mandatory; repository ports isolate domain/application code from
  persistence records and transactions.
- Runtime synchronization is disabled in both
  `apps/server/src/shared/database/typeorm.options.ts` and
  `apps/server/src/shared/database/data-source.ts`.
- Production migrations belong in `apps/server/migrations` as timestamped TypeORM classes, but
  design-stage migrations remain feature-local until implementation.
- No existing server entity, migration class, seed, persisted User, ID convention, audit-column
  convention, or test fixture convention exists. The feature model explicitly defines its first-use
  choices instead of claiming an inherited precedent.

## Staged migration and safety

`01-create-auth-schema.ts` creates empty `accounts`, `users`, and `sessions` tables, constraints,
foreign keys, and the one non-unique foreign-key index. Its `down` removes the cyclic foreign keys
before dropping the identity tables. No destructive change, backfill, concurrent index, non-
transactional operation, seed, or real-looking PII is present.

The Account/User bijection uses one shared identity UUID, equality checks on both linking columns,
and two unique, `DEFERRABLE INITIALLY DEFERRED` foreign keys. This lets registration insert the
pre-identified pair in one transaction while preventing missing or mismatched counterparts.
Session deletion and Account deletion are not lifecycle features; foreign keys therefore use
`RESTRICT`.

## Drift report

| Surface                   | Repository evidence                            | Designed model                                     | Drift                                                                        |
| ------------------------- | ---------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Tables/entities           | No implemented TypeORM entities or auth tables | Three new tables                                   | Expected new schema; no code entity exists yet.                              |
| Columns/types/nullability | No implemented persistence fields              | Defined in `data-model.md`                         | No comparable implementation; entity work must match this model.             |
| Relations/constraints     | No implemented persistence relations           | Deferred Account/User bijection; Session → Account | No comparable implementation.                                                |
| Indexes                   | No application indexes                         | Five query-backed indexes, four from uniqueness    | No comparable implementation.                                                |
| Migrations                | Live directory contains only `README.md`       | One reversible staged class                        | Expected design-stage delta; promote later with repository timestamp naming. |

## Legacy/deployed-state decision

Tracked repository evidence contains no User persistence or seed data, and the specification's
default is that none exists. This design therefore stages a fresh-schema migration without a
legacy backfill. Before promotion, the Tech Lead/deployment owner must confirm the target database
does not contain out-of-band `users`, `accounts`, or `sessions` tables. If it does, this migration
must not be promoted unchanged; an expand/backfill/contract plan and identity-matching decision are
required.

No live database was introspected: repository evidence was sufficient for design, and accessing
deployment credentials is outside the coding-agent credential policy.

## Validation record

- TypeScript migration syntax/type compatibility: passed with TypeScript 5.9.3 against the
  server's installed TypeORM types using a temporary validation-only project file (removed after
  the check).
- Mermaid: structural validation passed (one `erDiagram`, three declared entities); `mmdc` is not
  installed locally, so no rendered validation was available.
- Reversibility: static inspection passed. `down` drops `sessions`, removes both cyclic foreign
  keys, then drops `users` and `accounts`; every object created by `up` is removed.
- Foreign-key indexes: Account/User FKs are indexed by unique constraints; Session `account_id`
  has `idx_sessions_account_id`.
- System adherence: PostgreSQL/TypeORM only; no runtime synchronization, Mongoose artifact, live
  migration, or persistence leakage introduced.

## Unresolved decisions and gates

- Product and Security Lead approval of the Draft specification remains required before
  implementation.
- Security Lead and Backend Lead still own password-library and parameter selection. The schema
  preserves algorithm/parameter upgrade metadata without selecting secret or environment values.
- Deployment-state confirmation described above is required before promoting the staged migration.
