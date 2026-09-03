# Data-model audit — delivery-addresses — 2026-09-02

Work item: `feature` / `delivery-addresses` (`.size` = L, `.route` = full).
Inputs read in full: `spec.md`, `sad.md`, `CONTEXT.md`, `adr/0001`, `adr/0002`,
`docs/system/server-index.md`, `docs/system/server-architecture.md` §Persistence,
`docs/system/guides/creating-a-server-repository.md`, `apps/server/migrations/README.md`, all eleven
shipped migrations, the twenty-three shipped entities, `docs/features/ordering/data-model.md`, and
`packages/shared-types/src/enums/{permission-id,workspace-permission-id}.ts`.

## Staged migrations

| File                                                  | Class                                          | Objects                                                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `migrations/01-create-customer-schema.ts`             | `CreateCustomerSchema1786700000000`            | 2 tables, 6 checks, 3 FKs, 4 unique constraints, 2 indexes (one partial unique)                                          |
| `migrations/02-add-delivery-destinations.ts`          | `AddDeliveryDestinations1786700100000`         | 14 added columns + 1 rename across 5 shipped relations; 2 backfills; 13 checks added, 2 replaced; 5 FKs; 1 partial index |
| `migrations/03-grant-delivery-address-permissions.ts` | `GrantDeliveryAddressPermissions1786700200000` | 4 `permissions` rows + grant, 1 `workspace_permissions` row + grant, both idempotent                                     |

Measured against the database, the three together add **17 check constraints, 8 foreign keys, 4
unique constraints and 9 indexes**, and replace 2 checks
(`chk_purchase_draft_lines_received_quantity_not_negative`, `chk_purchase_drafts_closure_path`).

None is in the live tree. Promotion is a rename only — the class names already carry the planned
timestamps, which sort after the last shipped migration (`1786600200000`).

## Verification performed

The environment matters and is stated first: **Docker is not available on this machine and no
PostgreSQL server was running.** A throwaway PostgreSQL cluster was started from the locally
installed `postgresql@14`, on port 55432, with its data directory in the session scratchpad.

1. **Typecheck.** All three files compile under `tsc --noEmit --strict` (exit 0), and again under the
   `ts-node` type-checking loader that `typeorm-ts-node-commonjs` uses to execute them.
2. **Apply (empty).** All three applied cleanly on top of the eleven shipped migrations.
3. **Apply (populated) — the case `ordering` never had.** The eleven shipped migrations were applied
   alone, then seeded with rows that predate this release (2 Customer Orders with typed names
   `Acme Ltd` and `acme`, 2 Purchase Drafts — one Closed by whole-draft Arrival Confirmation — 2
   lines, 1 link, 1 Demand Snapshot). The three staged migrations then applied over those rows.
   Verified afterwards:
   - both lines backfilled to `via_warehouse`;
   - the line carrying a quantity backfilled to `ending_kind = 'arrival'` with the member and time
     taken from its draft's `arrival_confirmed_*`; the line without one left entirely NULL;
   - both typed customer names untouched (AC-11a, AC-24).
4. **Revert (populated).** All three reverted cleanly with new-model rows present. Verified: both new
   tables gone; all 14 added columns gone; `received_quantity` restored; `customer_name` restored to
   `NOT NULL` with the Customer-naming order given its Customer's name; zero `CUSTOMERS:*` rows left
   in `permissions` and zero `WAREHOUSES:ADDRESS_UPDATE` in `workspace_permissions`; the original
   `chk_purchase_drafts_closure_path` restored verbatim.
5. **Replay.** All three re-applied after the revert.
6. **Constraint probes.** 59 statements were run against the applied schema, each asserted to be
   accepted or rejected. **59/59 as expected.** Every rejection was attributed to the named
   constraint, and every case the specification requires to be _permitted_ was confirmed permitted.
7. **Plan checks.** Four queries were `EXPLAIN`ed; each uses the index created for it (below).
8. **Drift scan.** Column-by-column against the shipped schema, plus a `migration:generate` probe.
9. **Mermaid.** `mmdc` is not installed in this repo, so the fallback structural path from
   `_shared/mermaid-check.md` ran: one `erDiagram` declaration, 8 uniquely named attribute blocks
   each participating in a relationship, 12 well-formed relationship lines, 55 well-formed attribute
   lines, balanced braces outside the relationship arrows, no unresolved template placeholders.
10. **Cleanup.** The cluster, its data directory, the scratch data-sources, the copied baseline and
    all probe scripts were removed. The working tree contains only `docs/features/delivery-addresses/`
    additions.

### The one verification this environment could not perform

The repository targets **PostgreSQL 17** (`docker-compose.yml`, `postgres:17-alpine`), and the
shipped `1786525200000-AddActiveWarehouseSelection` uses `ON DELETE SET NULL (column_list)`, which is
**PostgreSQL 15+ syntax**. On PostgreSQL 14 that migration fails, so the baseline could not be
replayed as shipped.

For the harness only, a copy of that one file with `ON DELETE NO ACTION` was used. It touches
`users.active_warehouse_id` and no relation this feature changes, so it cannot affect any result
above. Nothing in the three staged migrations uses syntax newer than PostgreSQL 9.x — partial unique
indexes, composite foreign keys, check constraints, `ALTER TABLE … RENAME COLUMN`, and
`UPDATE … FROM` — so the PostgreSQL 14 results are expected to hold on 17.

**Carried forward:** re-run apply / revert / replay against a real PostgreSQL 17 before promoting
these files into `apps/server/migrations/`. `sad.md` §10 already requires migrations to be verified
against the real development database; this records that the requirement is not yet discharged.

### Constraint probes in detail

| Probe                                                                     | Expected | Enforced by                                                    |
| ------------------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| AC-03 duplicate customer name in one Warehouse                            | rejected | `uq_customers_warehouse_name`                                  |
| AC-03 a name held by an **Inactive** Customer is still taken              | rejected | `uq_customers_warehouse_name`                                  |
| AC-03a the same name in another Warehouse                                 | accepted | —                                                              |
| AC-02 a customer name of only spaces                                      | rejected | `chk_customers_name_stored_trimmed`                            |
| `spec.md` §8/7 `ACME LTD` beside `Acme Ltd` (case-sensitive)              | accepted | — (collation `C`, deliberate)                                  |
| AC-02 a Delivery Address whose text is empty                              | rejected | `chk_customer_delivery_addresses_address_text_stored_trimmed`  |
| AC-05 a second Main address for one Customer                              | rejected | `uq_customer_delivery_addresses_customer_main`                 |
| AC-04 clearing the old Main and setting the new one in one transaction    | accepted | —                                                              |
| AC-05 two Customers may each have a Main address                          | accepted | —                                                              |
| AC-06b an Inactive Delivery Address left carrying the Main flag           | rejected | `chk_customer_delivery_addresses_main_is_active`               |
| AC-06b deactivating the Main one while the flag moves, in one transaction | accepted | —                                                              |
| AC-06a deactivating a non-Main address                                    | accepted | —                                                              |
| an address recorded against a Customer of another Warehouse               | rejected | `fk_customer_delivery_addresses_customer`                      |
| access notes on an address with no text                                   | rejected | `chk_customer_delivery_addresses_address_text_stored_trimmed`  |
| AC-11 an order naming a Customer and one of its addresses                 | accepted | —                                                              |
| AC-11a an order by typed name, no Customer and no address                 | accepted | —                                                              |
| AC-24 an order carrying both a Customer and a typed name                  | rejected | `chk_customer_orders_customer_identity`                        |
| AC-24 an order carrying neither                                           | rejected | `chk_customer_orders_customer_identity`                        |
| AC-11 an order naming a Customer but no address                           | rejected | `chk_customer_orders_customer_identity`                        |
| AC-11a a typed-name order carrying an address                             | rejected | `chk_customer_orders_customer_identity`                        |
| AC-11c an order naming an address of **another** Customer                 | rejected | `fk_customer_orders_delivery_address`                          |
| AC-12 an order naming a Customer of another Warehouse                     | rejected | `fk_customer_orders_customer`                                  |
| AC-11b redirecting to another address of the same Customer                | accepted | —                                                              |
| AC-11c redirecting to an address of another Customer                      | rejected | `fk_customer_orders_delivery_address`                          |
| AC-11a the typed names `ordering` shipped still read                      | accepted | —                                                              |
| AC-13 a new line defaults to Via Warehouse with no address                | accepted | — (column `DEFAULT`)                                           |
| AC-13 a Direct to Customer line naming a Customer's address               | accepted | —                                                              |
| AC-13 a Direct to Customer line naming no address                         | rejected | `chk_purchase_draft_lines_delivery_mode_address`               |
| AC-14 a Via Warehouse line naming a Customer's address                    | rejected | `chk_purchase_draft_lines_delivery_mode_address`               |
| AC-12 a direct line naming an address of another Warehouse                | rejected | `fk_purchase_draft_lines_delivery_address`                     |
| a Delivery Mode outside the two the product has                           | rejected | `chk_purchase_draft_lines_delivery_mode`                       |
| AC-16 a frozen Via Warehouse line capturing address and notes             | accepted | —                                                              |
| AC-16 a frozen direct line capturing address, notes and customer name     | accepted | —                                                              |
| a captured customer name on a Via Warehouse line                          | rejected | `chk_purchase_draft_lines_frozen_capture_shape`                |
| captured access notes with no captured address                            | rejected | `chk_purchase_draft_lines_frozen_capture_shape`                |
| a captured address of only spaces                                         | rejected | `chk_purchase_draft_lines_frozen_delivery_stored_trimmed`      |
| AC-19 an arrival against a Via Warehouse line                             | accepted | —                                                              |
| AC-19 a direct delivery against a Direct to Customer line                 | accepted | —                                                              |
| AC-20 an arrival against a Direct to Customer line                        | rejected | `chk_purchase_draft_lines_ending_matches_mode`                 |
| AC-20 a direct delivery against a Via Warehouse line                      | rejected | `chk_purchase_draft_lines_ending_matches_mode`                 |
| AC-20a an ending quantity with no member and no time                      | rejected | `chk_purchase_draft_lines_ending_attribution`                  |
| an ending attribution with no quantity and no kind                        | rejected | `chk_purchase_draft_lines_ending_attribution`                  |
| AC-19 a line where nothing arrived records zero                           | accepted | —                                                              |
| a negative ending quantity                                                | rejected | `chk_purchase_draft_lines_ending_quantity_not_negative`        |
| AC-16 capturing the address key and its statement together                | accepted | —                                                              |
| AC-11a a link to a typed-name order captures no address at all            | accepted | —                                                              |
| a captured key with no captured statement                                 | rejected | `chk_purchase_draft_demand_snapshots_captured_address_pairing` |
| a captured statement with no captured key                                 | rejected | `chk_purchase_draft_demand_snapshots_captured_address_pairing` |
| a captured key naming an address that does not exist                      | rejected | `fk_purchase_draft_demand_snapshots_captured_address`          |
| AC-19 a draft closed by its last line's ending — no reason, no arrival    | accepted | — (the relaxation this release makes)                          |
| a draft closed with a reason                                              | accepted | —                                                              |
| a draft closed by both a whole-draft arrival **and** a reason             | rejected | `chk_purchase_drafts_closure_path`                             |
| an arrival time with no arrival attribution                               | rejected | `chk_purchase_drafts_closure_path`                             |
| the draft closed before this release keeps its arrival attribution        | accepted | —                                                              |
| AC-10 recording the Warehouse's address and its access notes              | accepted | —                                                              |
| AC-10 correcting it in place afterwards                                   | accepted | —                                                              |
| access notes on a Warehouse with no address                               | rejected | `chk_warehouses_delivery_notes_require_address`                |
| a Warehouse address of only spaces                                        | rejected | `chk_warehouses_delivery_address_text_stored_trimmed`          |
| AC-16a a Warehouse legitimately still has no address                      | accepted | —                                                              |

### Plan checks

| Query                                                         | Plan                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| AC-08 one Customer's Unfulfilled orders, ordered by needed-by | `Index Scan using idx_customer_orders_customer_unfulfilled`, **no sort step** |
| AC-11 a Customer's Main address                               | `Index Scan using uq_customer_delivery_addresses_customer_main`               |
| AC-07 a Customer's active addresses (the `FOR UPDATE` read)   | `Index Scan using idx_customer_delivery_addresses_customer_active`            |
| AC-03 customer-name availability in a Warehouse               | `Index Scan using uq_customers_warehouse_name`                                |

## Conventions detected and followed

- UUID primary keys, application-generated, declared `@PrimaryColumn('uuid')`.
- `created_at` / `updated_at` as `timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP`; append-only
  relations carry no `updated_at`.
- Activation and archival as a nullable instant (`warehouses.archived_at`, `items.deactivated_at`),
  never a boolean, with a `chk_*_deactivation_order` guard.
- Human-supplied names in `text` with collation `C`, plus a `chk_*_stored_trimmed` check.
- `warehouse_id` carried on every Warehouse-owned relation and drawn into composite foreign keys, so
  cross-Warehouse reach is refused by a reference rather than by application memory.
- `uq_<table>_id_<parent>` unique constraints that exist purely as composite reference targets.
- Constraint naming `uq_` / `idx_` / `chk_` / `fk_`, each prefixed with its table.
- Constraints, defaults and collations declared in migrations, **not** on entities.
- Permission catalogue extension per `apps/server/migrations/README.md`: insert the rows, then grant
  with an idempotent `INSERT … SELECT … WHERE NOT EXISTS`; `down` removes grants before rows.
- Raw SQL for altering a shipped table (the `AddPurchaseDraftReference` precedent); the `Table`
  builder for creating new ones.

## Deviations from existing convention

- **A boolean flag (`is_main`) in a schema that otherwise prefers nullable instants.** "Which address
  is Main" is not an event with a time; it is a position among siblings, and the partial unique index
  that enforces one-per-Customer needs a column to key on. A `main_since timestamptz` would express
  the same fact less directly and index no better.
- **A column renamed on a shipped relation** (`received_quantity` → `ending_quantity`). No migration
  in this repository has renamed a shipped column before. Justified in `data-model.md`; the
  alternative was a column named for the dock holding a figure the dock never saw.
- **Two captured columns where `spec.md` §8 discusses one.** The text is the frozen statement the
  question settles; the identifier beside it is the drift comparison key. Reasoned in
  `data-model.md` § `purchase_draft_demand_snapshots`, and flagged below as a decision taken where
  the sources were silent.

## Drift detected

1. **`purchase_drafts.reference` and `purchase_draft_reference_seq` are in the shipped schema and
   absent from `docs/features/ordering/data-model.md`.** They were added by the shipped
   `1786600200000-AddPurchaseDraftReference`, after that document was written. The entity
   (`purchase-draft.entity.ts`) carries the column correctly, so this is **documentation drift only**
   — no code or schema is wrong. Owner: whoever next touches `ordering`; this feature does not edit
   another feature's artifacts. A column-by-column scan of all nine `ordering` relations found no
   other omission.
2. **No structural drift between the shipped entities and the shipped schema.** Verified by running
   `migration:generate` against the shipped entities and the shipped schema: it emits **zero**
   `ADD COLUMN` and zero `DROP COLUMN`.
3. **`migration:generate` is a trap in this repository and must never be run.** The same probe emits
   **368 statements** that would drop every `chk_*` constraint, every column `DEFAULT` and every `C`
   collation in the database — because none of them is declared on the entities. That is the repo's
   convention, not drift, but the script is exposed in `apps/server/package.json` and the failure
   would be silent and enormous. Recorded in `data-model.md`; worth a line in
   `apps/server/migrations/README.md`, which is a `system-docs` change rather than this feature's.

## Destructive-change sequencing

Two columns become mandatory against populated relations; both use expand / backfill / contract, and
neither drops or rewrites shipped data:

1. `purchase_draft_lines.delivery_mode` — added nullable → backfilled to `via_warehouse` → given that
   `DEFAULT` → `SET NOT NULL`.
2. `purchase_draft_lines.ending_kind` / `ending_recorded_by_user_id` / `ending_recorded_at` — added
   nullable → backfilled from each line's draft `arrival_confirmed_*` for lines already carrying a
   quantity → `chk_purchase_draft_lines_ending_attribution` added. A line carrying a quantity whose
   draft has no arrival attribution makes that `ADD CONSTRAINT` fail deliberately and loudly.

One relaxation runs the other way and needs no backfill: `customer_orders.customer_name` drops
`NOT NULL`.

**A reversibility defect was found and fixed during this stage.** The first version of migration 02's
`down` restored `chk_purchase_drafts_closure_path` without repairing the rows the restored check
cannot admit. With a draft closed by the new per-line path present, the revert aborted:

```text
error: check constraint "chk_purchase_drafts_closure_path" of relation "purchase_drafts"
       is violated by some row
```

`down` now performs two repairs before restoring the check, and the revert was re-verified with such
a draft present:

- a draft closed by its last line's ending takes the whole-draft Arrival Confirmation attribution
  from the **last ending recorded on it** — the faithful mapping, because `closed_at` is that same
  instant, which is also what `chk_purchase_drafts_transition_order` requires of the pair;
- a Closed draft the first repair cannot reach is given a `closure_reason` stating what happened.

Both repairs, and the one on `customer_name`, are lossy in the **domain** sense and lossless in the
**schema** sense. `data-model.md` § "What a revert costs" states each cost rather than leaving it to
be discovered during an incident.

## Decisions taken where the sources were silent

| Decision                                                                                             | Why                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Demand Snapshot captures **both** the address identifier and its text                            | AC-18 shows the member the frozen text; AC-18a's "redirected back" is an identity event. Comparing text alone would report drift when a member merely corrects a typo in an address never redirected — not what `CONTEXT.md` defines Address Drift to be. |
| `arrival_confirmed_*` on `purchase_drafts` is **retained**, not dropped (`sad.md` §7 leaves it open) | It is the only record of who confirmed the arrival of every draft closed before this release. No new path writes it.                                                                                                                                      |
| `received_quantity` renamed to `ending_quantity`                                                     | The column now also holds what a customer received on a direct line. The touch cost is already being paid by ADR 0002.                                                                                                                                    |
| A Customer-naming order stores **no** `customer_name`                                                | Makes AC-03b structural: the name is read live, so there is no denormalized copy a correction would have to rewrite.                                                                                                                                      |
| The last-line closure predicate is a `NOT EXISTS` guard on the `UPDATE`, not a re-count              | `sad.md` §6.10 flags the choice as this stage's. The guard makes the predicate and the write one statement and therefore one decision.                                                                                                                    |
| No `(warehouse_id, delivery_mode)` index on `purchase_draft_lines`                                   | The by-line read (AC-22) is already served by the shipped draft and line indexes; the mode split is a projection over rows already fetched. Adding one would be the "just in case" this stage exists to avoid.                                            |
| AC-14 gets no check constraint of its own                                                            | The Warehouse's own address has no identifier `customer_delivery_address_id` could hold, so the direct-line-to-own-address case is structurally impossible.                                                                                               |
| `idx_customer_orders_customer_unfulfilled` is created **inside** the migration transaction           | Not `CONCURRENTLY`: at the `spec.md` §1 scale the `SHARE` lock is brief, and `CONCURRENTLY` cannot run inside the transaction every migration here runs in.                                                                                               |

## Unresolved / carried forward

1. **Re-verify against PostgreSQL 17** before promoting these files. This machine has only
   PostgreSQL 14, which cannot replay the shipped baseline. _(Backend Lead, before promotion.)_
2. **`sad.md` §11's outstanding gate is untouched by this stage.** The four amendments to `ordering`
   still have no `docs/change-requests/ordering-*`. This model **implements** two of them —
   per-line endings and the extended Demand Snapshot — so a reviewer reading `ordering`'s
   `data-model.md` alone now finds it contradicted at the schema level as well as the specification
   level. _(PM, before `tasks`.)_
3. **`ordering/data-model.md` needs `purchase_drafts.reference` added** (drift 1 above).
4. **`apps/server/migrations/README.md` should warn against `migration:generate`** (drift 3 above).
   A `system-docs` change, not this feature's.
5. **Entity work `tasks` must schedule**, since this stage stages migrations and not production code:
   two new entities (`CustomerEntity`, `CustomerDeliveryAddressEntity`) and four changed ones
   (`CustomerOrderEntity`, `PurchaseDraftLineEntity` — including the `receivedQuantity` →
   `endingQuantity` rename and its repository callers, `DemandSnapshotEntryEntity`,
   `WarehouseEntity`).
6. **The concurrency claims stay unproven by the automated suite**, exactly as `sad.md` §11 records:
   PGlite has one backend, so the lock order and conditional-update races are asserted by statement
   shape. Nothing in this model changes that, and it must not be reported as met.

## Definition of Done

| Requirement                                                                    | Status                                                                                                                 |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| The model links to and conforms with system persistence architecture           | Met — PostgreSQL/TypeORM, shared entities, specialized repositories, forward-only migrations                           |
| Every schema change has a staged migration with reversible `up`/`down`         | Met — apply, revert and replay verified against a real server with rows present, including the per-line-closure repair |
| Runtime synchronization never enabled; no MongoDB/Mongoose artifact            | Met — `synchronize: false` untouched                                                                                   |
| Drift and safety checks reported with evidence                                 | Met — see § Drift detected and § Destructive-change sequencing                                                         |
| Mermaid, migration syntax, reversibility, FK indexing, `docs/system` adherence | Met — see § Verification performed, items 1, 4, 5, 9, and `data-model.md` § Indexes                                    |
