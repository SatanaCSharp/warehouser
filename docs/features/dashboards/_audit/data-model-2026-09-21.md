# Data-model audit — dashboards — 2026-09-21

What this stage staged, what it verified, what it could not verify, and where it departed from the
upstream artifacts. Companion to [`../data-model.md`](../data-model.md).

The feature stores nothing. Its whole persistence footprint is one Workspace Permission catalogue
row and one index, so the bulk of this stage's work was **not** designing a schema but proving that
the eight derived reads are served by the schema that already exists — and finding the one place
they are not.

## Staged migrations

| Staged file                            | Class                                      | Statements                                                                          |
| -------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `01-add-reason-concentration-index.ts` | `AddReasonConcentrationIndex1786900000000` | 1 `CREATE INDEX` on a populated relation; `down` drops it                           |
| `02-grant-dashboard-permissions.ts`    | `GrantDashboardPermissions1786900100000`   | 1 catalogue insert + 1 idempotent `INSERT … SELECT` grant; `down` reverses in order |

Neither is in `apps/server/migrations/`. Class timestamps `1786900000000` / `1786900100000` sort
after the last shipped migration, `1786800100000-GrantArrivalInspectionPermissions`. No shipped
migration was edited.

Both typecheck under the server's own compiler settings (`--strict`, `moduleResolution bundler`),
verified by compiling them from inside `apps/server` where `typeorm` resolves.

## Verification performed

A throwaway PostgreSQL cluster (Docker unavailable; local `postgresql@14` on port 54329, TCP because
the scratchpad path exceeds the Unix-socket limit). The shipped baseline was applied through the
TypeORM CLI against the compiled data source, then the two staged migrations.

**Seeded to the `spec.md` §1 scale before anything was measured:**

| Relation                         | Rows    | Shape                                                                   |
| -------------------------------- | ------- | ----------------------------------------------------------------------- |
| `customer_orders`                | 238 950 | 143 370 unfulfilled (~3 585/Warehouse), plus fulfilled and cancelled    |
| `purchase_draft_lines`           | 120 000 | 48 000 with a recorded ending; 40 000 Direct to Customer; 23 874 judged |
| `items`                          | 80 000  | 2 000/Warehouse, ~1% deactivated                                        |
| `purchase_drafts`                | 40 000  | 250 open/Warehouse (the §1 figure) + 750 in the retained record         |
| `purchase_draft_line_rejections` | 19 306  | both Sources, all four Dispositions, across the 10-Reason catalogue     |
| `arrival_allocations`            | 16 691  | one per link, several per Customer Order                                |
| `warehouses`                     | 40      | 20 in the Workspace under test, 20 in a second Workspace as noise       |

`VACUUM ANALYZE` before every plan check.

### Migration probes

| #   | Probe                                                                             | Expected                                                                             | Result            |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------- |
| 1   | Apply both over populated relations                                               | both succeed                                                                         | ✅ as expected    |
| 2   | Catalogue row present as `assignable` with its label                              | `WAREHOUSE_PERFORMANCE:WATCH` present                                                | ✅                |
| 3   | **AC-21a** — grant reaches Workspace Owner Roles established _before_ the release | both pre-existing Owner Roles hold it                                                | ✅                |
| 4   | **AC-21a** — no existing custom Role gains it                                     | the seeded `Supervisor` Role does not                                                | ✅                |
| 5   | Re-running the grant statement                                                    | `INSERT 0 0`, a no-op                                                                | ✅                |
| 6   | **AC-21** — a custom Role may be granted it by hand                               | admitted, because `kind = 'assignable'`                                              | ✅                |
| 7   | Deleting the catalogue row while a grant stands                                   | refused by `fk_workspace_role_permissions_permission`                                | ✅ raised by name |
| 8   | A lowercase identifier                                                            | refused by `chk_workspace_permissions_identifier`                                    | ✅ raised by name |
| 9   | Revert both, with a custom Role holding the Permission                            | catalogue row and **all** grants gone, pre-release grant count restored exactly (34) | ✅                |
| 10  | Revert `01` with 19 306 Rejections present                                        | index dropped, 19 306 rows intact                                                    | ✅                |
| 11  | Replay both                                                                       | both succeed, index present again                                                    | ✅                |
| 12  | Index build cost on the populated relation                                        | stated, not assumed                                                                  | 11.6 ms, 168 kB   |

Probe 9 is the one worth restating: `02`'s `down` keys the `DELETE` on the Permission rather than on
the Role kind, so it removes an Owner's later delegation to a custom Role too. That is what makes
the revert complete; it is also a real cost, recorded in `data-model.md` § What a revert costs.

### Plan checks

`EXPLAIN (ANALYZE, BUFFERS)` on each Panel's read, warm buffers, at the scale above.

| Panel                                | Access path chosen                                                                  | Execution  |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ---------- |
| Coverage Gap — outstanding CTE       | Bitmap Index Scan `idx_customer_orders_unfulfilled_demand` (partial)                | 8.2 ms     |
| Coverage Gap — inbound CTE           | `idx_purchase_drafts_warehouse_state_created` → `idx_purchase_draft_lines_draft_id` | 1.6 ms     |
| Arrival Timing — supply series       | `idx_purchase_drafts_warehouse_state_created` → `idx_purchase_draft_lines_draft_id` | 0.2 ms     |
| Purchasing Pipeline                  | Bitmap Index Scan `idx_purchase_drafts_warehouse_state_created`                     | 0.1 ms     |
| **Reason Concentration**             | Bitmap Index Scan **`idx_purchase_draft_line_rejections_warehouse_reason`**         | **0.5 ms** |
| Demand Pressure (20 Warehouses)      | Parallel Seq Scan — 20 of 40 Warehouses is half the relation                        | 22.2 ms    |
| Order Flow (12 weeks, 20 Warehouses) | Seq Scan at this seed's compressed date range                                       | 124.8 ms   |
| Purchasing Spread (20 Warehouses)    | `idx_purchase_drafts_warehouse_state_created`                                       | 2.9 ms     |
| Receipt Reliability (20 Warehouses)  | Parallel Seq Scan + hash join                                                       | 15.0 ms    |

Warehouse surface, all four together: ~10 ms against a 600 ms budget. Workspace surface, all four:
~165 ms against 900 ms — and they are four separate parallel requests, not a sum.

**Counterfactual for the one index added.** Same statement, index dropped inside a rolled-back
transaction: Seq Scan, 464 shared buffers, 1.84 ms — against Bitmap Index Scan, 217 buffers,
0.54 ms. The relation is cumulative and unfiltered by any state, so the 1.84 ms is the figure that
grows with the deployment and the 0.54 ms is not. This is the whole argument for the index, and it
is measured rather than asserted.

**Counterfactual for the index that was withdrawn.** `purchase_draft_lines (warehouse_id,
purchase_draft_id)` was staged first, on the reasoning that no existing index leads with that column
and Receipt Reliability is the only unbounded-period read. The server rejected the reasoning: at the
whole-Workspace shape (20 of 40 Warehouses) the planner **declines** the index and parallel-seq-scans
in 15 ms; it chooses it only at low selectivity — with three Warehouses (7.5%) the plan is a Bitmap
Index Scan on it, 9.9 ms. So the index helps only where a Workspace is a small fraction of a large
multi-tenant deployment, a shape this environment cannot produce, and the existing paths already sit
sixty times inside budget. It was removed from the staged migration. `data-model.md`
§ Indexes deliberately not added records the trigger that would bring it back.

**One finding for `implement`, not for the schema.** The Workspace scope must be bound as an
explicit `uuid[]`. Written `warehouse_id IN (SELECT id FROM warehouses WHERE …)` the planner
seq-scans `customer_orders` even at 11% selectivity; written `warehouse_id = ANY($1::uuid[])` over
the already-resolved active set it uses `idx_customer_orders_warehouse_created` with **both** columns
in the index condition. The active-Warehouse set is read anyway, so this costs nothing.

### Behaviour probes for the two rulings this stage made

| Probe                                                   | Result                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `date_trunc('week', DATE '2026-09-20')` — a Sunday      | returns Monday 14 September: ISO weeks, Monday start, no configuration  |
| `2026-09-21 23:30:00+00` read in `Europe/Kyiv` vs `UTC` | `2026-09-22` vs `2026-09-21` — the timezone shifts a whole calendar day |

The first retires half of `spec.md` §8's fourth question at zero cost. The second is why the other
half cannot be retired and needs a configured value.

### The verifications this environment could not perform

- **The §6 p95 latency targets.** Every figure above is PostgreSQL **14** with a synthetic
  distribution; production targets `postgres:17-alpine`. These are directional evidence about
  _plans_, not latency measurements, and no number here may be cited as meeting a p95 target.
- **The shipped baseline as shipped.** `1786525200000-AddActiveWarehouseSelection` uses
  `ON DELETE SET NULL (column_list)`, PG15+ syntax. For this harness only, the **compiled copy in
  `dist/`** was patched to `ON DELETE NO ACTION`; no source file was touched. The two staged
  migrations do not touch `users` and are unaffected, but the baseline replay is a PG14 result.
- **The multi-tenant selectivity the withdrawn index needs.** Simulated by narrowing the Warehouse
  set rather than by seeding many Workspaces.
- **PGlite proves none of this.** The repository's integration tier is single-backend WebAssembly.
  It will exercise the SQL's correctness; it cannot choose a production plan.

## Conventions detected and followed

- Entities carry column names and types only; every `CHECK`, `DEFAULT` and collation lives in the
  migration. This release adds none of the three.
- Permission catalogue extension follows `apps/server/migrations/README.md` and
  `1786700200000-GrantDeliveryAddressPermissions` exactly: insert, then `NOT EXISTS`-guarded
  `INSERT … SELECT` across the existing protected Roles, `down` removing grants before the row.
- `queryRunner.manager.insert` takes entity **property** names; raw SQL takes snake_case columns.
  Kept in separate statements deliberately.
- `SUBJECT:VERB` catalogue identifiers, `WATCH` as the read verb of both catalogues, terse
  imperative labels (`View warehouses` → `View warehouse performance`).
- Repositories are specialized around a cohesive persistence operation, live in
  `shared/domain/repositories/`, and hold no private methods.
- One index per concrete query, with the query named beside it, and a stated list of the indexes
  deliberately not added — the shape `arrival-inspection` and `ordering` both use.

## Deviations from the upstream artifacts

| #   | Deviation                                                                                                                                                                               | Why                                                                                                                                                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Two staged migrations, where `sad.md` §7 says "both in one migration".**                                                                                                              | Every feature in this repository ships its schema change and its catalogue grant as separate files, and `1786025100000-GrantUsersManagementPermissions` is a standalone grant. Reverting authority and reverting an index carry different risk and should be separately revertible. `sad.md` §7 needs the sentence corrected. |
| 2   | **`WAREHOUSE_PERFORMANCE:WATCH`, not `sad.md` §5's `…:OBSERVE`.**                                                                                                                       | `sad.md` §5 called `OBSERVE` a working name and routed the key here. `WATCH` is the read verb of both catalogues without exception; a second verb for the same act would be the one inconsistency in a vocabulary whose value is predictability. `sad.md` §5 and §7 need the name updated.                                    |
| 3   | **`sad.md` §3 scopes "one new index on `purchase_draft_line_rejections`, if `/data-model` confirms it". That is what shipped — but a second index was staged, measured and withdrawn.** | Recorded rather than hidden: the SAD's In-scope list is correct as written, and the reasoning that nearly expanded it is in `data-model.md` so a later reviewer does not re-derive it. No change owed to `sad.md`.                                                                                                            |
| 4   | **`spec.md` §8's fifth question asked for the Rejection **volume** to size the index. It was not needed for that.**                                                                     | The index's shape is decided by the query, not the volume. The volume matters for the migration's `SHARE` lock window instead, so `data-model.md` states a row-count threshold (~1.5 M Rejections) at which the build should move out of the migration — which answers the question more usefully than a number would have.   |

## Drift detected

**Between the documented model, the TypeORM entities and the shipped migrations: none.** Every
column, type, nullability, relation, constraint and index the eight reads depend on was checked
against both the entity file and the migration that created it, and all three agree.

**In the shipped schema, one defect, found by seeding to scale:**

`purchase_drafts.reference` has DEFAULT
`'PD-' || lpad(nextval('purchase_draft_reference_seq')::text, 4, '0')`. PostgreSQL's `lpad`
**truncates** a string longer than its target width, so from the 10 000th Purchase Draft every
minted reference collides with one already issued — `nextval` 10000 → `PD-1000`, 10001 → `PD-1000`,
12345 → `PD-1234` — and `uq_purchase_drafts_reference` rejects the insert. The sequence is global
rather than per-Warehouse, so the failure is deployment-wide and permanent: **no Purchase Draft can
be created again.**

_How it surfaced:_ seeding 40 000 drafts failed at `PD-1000` with the table empty. Confirmed
directly: `lpad('9999',4,'0')` = `9999`, `lpad('10000',4,'0')` = `1000`, `lpad('10001',4,'0')` =
`1000`. For the harness only, the throwaway cluster's DEFAULT was widened to 8 characters so seeding
could proceed; nothing in the repository was changed.

It is not this feature's defect and not this stage's to fix. It is recorded here and in
`data-model.md` because this feature is the first to depend on the **whole retained record** of
Purchase Drafts — Receipt Reliability reads every draft a Warehouse ever had — so the 10 000-draft
ceiling is inside the horizon these reads are designed for. Owner: `ordering` owner (Tech Lead).
The fix is a one-line migration widening the pad, plus a decision about references already minted.

## Destructive-change sequencing

There is none to sequence. No column is added, widened, renamed, dropped or made `NOT NULL`; no data
is backfilled or rewritten; no relation is created or removed. The two ordering rules that do apply:

1. Inside `02`, the catalogue row is inserted before the grant that references it, and `down`
   reverses — grants first, because `fk_workspace_role_permissions_permission` is
   `ON DELETE RESTRICT` (probe 7).
2. `01` before `02` only by timestamp; they touch disjoint relations and are independent.

The one operational cost is `01`'s `SHARE` lock during the index build — 11.6 ms at 19 306
Rejections, extrapolating to under a second at ~1.5 M. Past that, the index should leave the
migration and be built with `CREATE INDEX CONCURRENTLY` by hand, since a concurrent build cannot run
inside the transaction every migration here runs in.

## Decisions taken where the sources were silent

1. **`APP_TIMEZONE`, one server configuration value, bound as a query parameter.** Not a column
   (nothing records a per-Warehouse or per-user zone and `spec.md` §3 puts that out of scope), and
   not the connection's implicit `TimeZone` (untestable, and makes the same query answer differently
   depending on how the pool was opened). Default `UTC`. **Decided here, not applied here** — this
   stage writes no live configuration; `tasks` owns the `.env.example` line and the three call sites.
2. **The withdrawn part of an Order Flow week is a cancelled order's retained
   `outstanding_quantity`.** AC-16 asks for "how much has since been cancelled" as a part of the
   week's recorded whole. The schema supports exactly one reading: `chk_customer_orders_state_outstanding`
   keeps the quantity a cancellation left uncovered, and nothing records what was assigned before
   it, so reporting the whole `quantity` as withdrawn would double-count the allocated part.
   Recorded as a schema fact; `/api` names the field but does not get to choose a different column.
3. **The Conformance Rate is not restricted by Delivery Mode.** AC-20b restricts the On-time Arrival
   Rate to Via Warehouse lines and says nothing about conformance; the glossary's definition names
   no mode. A Direct to Customer line carrying `met` or `not_met` therefore counts. Stated because
   the two rates sit on one Panel and the asymmetry is easy to normalize away by accident.

## Unresolved / carried forward

- [ ] `purchase_drafts.reference` collides from the 10 000th draft — owner: `ordering` owner (Tech
      Lead), due **before this feature ships**.
- [ ] `APP_TIMEZONE=UTC` in `apps/server/.env.example`, the `ConfigService` read, and the bound
      parameter at all three sites — owner: Backend Lead, due `tasks`.
- [ ] `packages/shared-types/src/enums/workspace-permission-vocabulary.spec.ts` pins the catalogue as
      a literal list and asserts it matches `WorkspacePermissionId` exactly. The enum entry and the
      literal are owed together, and `@warehouser/shared-types` must be rebuilt before server tests
      see the new entry — owner: Backend Lead, due `implement`.
- [ ] `sad.md` §7's "both in one migration" and §5/§7's `WAREHOUSE_PERFORMANCE:OBSERVE` need
      correcting to match what shipped — owner: Tech Lead, due before `tasks`.
- [ ] The p95 targets stay unproven. Nothing measured here is a latency result — owner: Tech Lead,
      due before `ship`.
- [ ] The withdrawn `purchase_draft_lines` index, if a real deployment misses the 900 ms budget —
      owner: Backend Lead, due after the first real-PostgreSQL measurement.

## Definition of Done

| Requirement                                                            | Status                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The model links to and conforms with system persistence architecture   | ✅ PostgreSQL, TypeORM, `shared/domain/repositories/`, reviewed migrations, `synchronize` off                                                                                                                                                          |
| Every schema change has a staged migration with reversible `up`/`down` | ✅ both, applied → reverted → replayed on a real server with rows present                                                                                                                                                                              |
| Runtime synchronization never enabled; no MongoDB/Mongoose artifact    | ✅ neither touched                                                                                                                                                                                                                                     |
| Drift and safety checks reported with evidence                         | ✅ no model/entity/migration drift; one shipped defect reported with a reproduction                                                                                                                                                                    |
| Mermaid structure, migration syntax, reversibility, FK indexing        | ✅ ER diagram structurally validated (no `mmdc` available — one declaration, 15 relationships, 13 entities, 9 attribute blocks, balanced delimiters, no placeholders); both classes typecheck under `--strict`; no foreign key added, so none to index |
| Indexes justified by a concrete query                                  | ✅ one added, with a measured counterfactual; one staged and withdrawn on measurement                                                                                                                                                                  |
| No design-stage file in the live migration directory                   | ✅ `apps/server/migrations/` untouched                                                                                                                                                                                                                 |
