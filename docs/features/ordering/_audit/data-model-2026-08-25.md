# Data-model audit — ordering — 2026-08-25

Work item: `feature` / `ordering` (`.size` = XL, `.route` = full).
Inputs read in full: `spec.md`, `sad.md`, `CONTEXT.md`, `docs/system/server-index.md`,
`docs/system/server-architecture.md`, `docs/system/adr/21-07-2026-postgresql-with-typeorm.md`,
`docs/system/guides/creating-a-server-repository.md`, `apps/server/migrations/README.md`, all eight
shipped migrations, and the fourteen existing entities.

## Staged migrations

| File                                          | Class                                   | Tables / rows                                                                                    |
| --------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `migrations/01-create-ordering-schema.ts`     | `CreateOrderingSchema1786600000000`     | 9 tables, 31 checks, 21 foreign keys, 7 unique constraints, 12 indexes, 4 seeded Packaging Types |
| `migrations/02-grant-ordering-permissions.ts` | `GrantOrderingPermissions1786600100000` | 16 Permission rows + idempotent grant to every `warehouse_manager` Role                          |

Neither file is in the live tree. Promotion is a rename only — the class names already carry the
planned timestamps, which sort after the last shipped migration (`1786525200000`).

## Verification performed

1. **Typecheck.** Both files compile under `apps/server/tsconfig.json` (`tsc --noEmit`, exit 0).
2. **Apply.** Both applied cleanly to a throwaway database (`warehouser_dm_check`) on top of all
   eight shipped migrations, via the repo's own `typeorm-ts-node-commonjs migration:run`.
3. **Revert.** Both reverted cleanly. Verified afterwards that none of the nine tables remained and
   that zero `ITEMS:*` / `ITEM_STOCK:*` / `CUSTOMER_ORDERS:*` / `PURCHASE_DRAFTS:*` rows were left in
   `permissions` — the `down` methods are complete, not partial.
4. **Replay.** Both re-applied after the revert, confirming the pair is replayable.
5. **Constraint probes.** 24 representative statements were run against the applied schema, each
   asserted to be accepted or rejected. **24/24 passed.** Every rejection was attributed to the named
   constraint, and the two cases the spec requires to be _permitted_ were confirmed permitted.
6. **Plan check.** The consolidated-demand aggregation was `EXPLAIN`ed and uses
   `idx_customer_orders_unfulfilled_demand` as a `GroupAggregate` with no sort step.
7. **Mermaid.** `mmdc` is not installed in this repo, so the fallback structural path from
   `_shared/mermaid-check.md` ran: one `erDiagram` declaration, 9 properly nested and uniquely named
   entity blocks, 12 well-formed relationship lines, all attribute lines well-formed, no unresolved
   template placeholders.
8. **Cleanup.** The scratch database, the scratch data-source and all probe files were removed. The
   working tree contains only `docs/features/ordering/` additions.

### Constraint probes in detail

| Probe                                                          | Expected | Enforced by                                        |
| -------------------------------------------------------------- | -------- | -------------------------------------------------- |
| AC-07 duplicate SKU in the same Warehouse                      | rejected | `uq_items_warehouse_sku`                           |
| AC-07a same SKU in another Warehouse                           | accepted | —                                                  |
| AC-09 negative On-hand Quantity                                | rejected | `chk_items_on_hand_quantity_not_negative`          |
| AC-09a adjustment with a blank reason                          | rejected | `chk_item_stock_adjustments_reason_stored_trimmed` |
| AC-03 Customer Order naming an Item of another Warehouse       | rejected | `fk_customer_orders_item`                          |
| AC-02 Customer Order quantity of zero                          | rejected | `chk_customer_orders_quantity_positive`            |
| AC-17a Unfulfilled order with nothing outstanding              | rejected | `chk_customer_orders_state_outstanding`            |
| AC-01 a valid Customer Order                                   | accepted | —                                                  |
| AC-19a cancellation with no reason or attribution              | rejected | `chk_customer_orders_cancellation_attribution`     |
| AC-19b Outstanding Quantity above the quantity asked for       | rejected | `chk_customer_orders_outstanding_bounds`           |
| AC-13 Packaging Type outside the catalogue                     | rejected | `fk_purchase_draft_lines_packaging_type`           |
| AC-11 draft line naming an Item of another Warehouse           | rejected | `fk_purchase_draft_lines_item`                     |
| AC-12 draft line with a catalogue Packaging Type               | accepted | —                                                  |
| AC-11a link quantity that does not add up to the line          | accepted | — (deliberately unconstrained)                     |
| a second link on the same (line, order) pair                   | rejected | `uq_purchase_draft_line_links_line_order`          |
| AC-18 Allocation to a Customer Order the line is not linked to | rejected | `fk_arrival_allocations_link`                      |
| AC-17 Allocation through the line's own link                   | accepted | —                                                  |
| AC-17b a second Allocation on one link                         | rejected | `arrival_allocations` primary key                  |
| AC-16 one Demand Snapshot row per link                         | accepted | —                                                  |
| AC-16 a second Demand Snapshot row on one link                 | rejected | `purchase_draft_demand_snapshots` primary key      |
| AC-21a Closed by both an arrival and a closure reason          | rejected | `chk_purchase_drafts_closure_path`                 |
| AC-24a Discarded after having been made ready                  | rejected | `chk_purchase_drafts_readiness_attribution`        |
| AC-14 Draft → Ready for Ordering with attribution              | accepted | —                                                  |
| AC-21 Ready → Closed with a reason                             | accepted | —                                                  |

Fixtures used `example.test` addresses and placeholder customer names only.

## Conventions detected and followed

- DDL through TypeORM's `Table` / `TableForeignKey` / `TableIndex` / `TableUnique` / `TableCheck`
  builders, not raw SQL strings; raw SQL only for the catalogue grant, as
  `1786025100000-GrantUsersManagementPermissions` already does.
- App-generated `uuid` primary keys with no database default.
- `timestamptz` `created_at` / `updated_at`, `DEFAULT CURRENT_TIMESTAMP`, no triggers.
- Naming: `fk_<table>_<subject>`, `idx_<table>_<cols>`, `uq_<table>_<cols>`, `chk_<table>_<rule>`.
- `ON DELETE RESTRICT` everywhere; no cascade.
- Composite foreign keys through the tenant column to prove same-scope ownership — the exact shape
  `1786525000000-CreateWorkspaceMemberships` uses for `(user_id, workspace_id)`.
- Withdrawal modelled as a nullable instant (`warehouses.archived_at`) rather than a boolean flag.
- `text` with `collation: 'C'` for name-like columns (`warehouses.name`, `workspaces.name`).
- Trimmed-non-empty checks on stored free text (`chk_*_stored_trimmed`).
- Inline comments citing the AC or SAD section each constraint serves.
- Catalogue tables keyed by a `varchar` identifier with a pattern check, following `permissions`.

## Deviations from existing convention

| Deviation                                                                                                                    | Why                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `item_stock_adjustments`, `arrival_allocations` and `purchase_draft_demand_snapshots` carry `created_at` but no `updated_at` | All three are append-only/frozen by specification. `sessions` already ships without audit columns, so this is precedented rather than novel.                     |
| First use of `integer`, `date` and partial indexes in this repo                                                              | No prior migration needed a quantity, a calendar date, or a predicate-carrying index. `sad.md` §8 explicitly asks the demand index to carry its state predicate. |
| Catalogue identifier checked by pattern, not enumerated                                                                      | `CONTEXT.md` requires the Packaging Type catalogue to be extendable by migration; an enumerated check would force a schema change to add a row.                  |

## Drift detected

1. **`PermissionId` union vs the catalogue — actionable.**
   `packages/shared-types/src/enums/permission-id.ts` declares twelve Warehouse Permissions. Migration
   02 seeds sixteen more. The union must gain all sixteen in the same change, or the database
   catalogue and the compile-time vocabulary disagree.
   _Checked:_ none of the sixteen collides with an existing `PermissionId` or `WorkspacePermissionId`
   member, and `workspace-permission-vocabulary.spec.ts` uses `PermissionId` only for a type-level
   disjointness assertion (`PermissionIdConst.USERS_CREATE`), so adding members does not break it.
   _Recommendation:_ mirror the workspace precedent — extend
   `workspace-permission-vocabulary.spec.ts`, or add a sibling warehouse vocabulary spec, that pins
   migration 02's `newPermissions` against the union so the two cannot drift again. This belongs in
   `tasks`, not here.
2. **No entity/migration conflict.** None of the nine table names appears in `apps/server/src` or in
   any shipped migration. (`grep` hit `'items'` twice in `access.controller.ts`, but those are
   `RolePage['items']` pagination keys, not a table.) No shipped table, column, key, constraint or
   index is altered by either staged migration.
3. **Entities not yet written** — expected at this stage. The nine `*.entity.ts` classes named in
   `sad.md` §5 do not exist; `implement` creates them. Column names, nullability and types in
   `data-model.md` are the contract they must match.

## Destructive-change sequencing

**None required.** Every relation is new and starts empty, so there is no expand/backfill/contract
sequence, no new non-null column over existing rows, no rewrite and no drop. Both migrations are
forward-only and safe to apply to a populated production database, because they touch nothing that
is already populated — the sole write to a shipped table is migration 02's _additive_ insert into
`permissions` and `role_permissions`, guarded by `NOT EXISTS`.

Every index is created on an empty table inside the same migration that creates the table, so
`CREATE INDEX CONCURRENTLY` is neither used nor warranted, and no statement needs to run outside the
migration transaction. Rollback is therefore complete rather than best-effort: verified by an actual
revert, not by inspection.

## Decisions taken where the sources were silent

1. **One link per `(purchase_draft_line_id, customer_order_id)` pair.** AC-11a explicitly permits a
   _second line_ linking to the same Customer Order, and one line linking to several orders with
   quantities that do not add up — both are permitted here and were probed as accepted. It is silent
   on whether _one line_ may hold two links to the _same_ order. Because AC-10a makes "change the
   quantity stated on a link" a first-class operation, and because the Demand Snapshot and the
   Allocation are both keyed by link, two links on one pair would make "the quantity intended for
   this customer on this line" ambiguous. The unique constraint is the safer default and is trivially
   reversible (drop one constraint). **Flagged for confirmation** — see below.
2. **`arrival_confirmed_at` / `arrival_confirmed_by_user_id` on the draft.** `sad.md` §7 names
   "close attribution" without distinguishing the two closure paths. AC-21a requires that a draft
   Closed by arrival and one Closed with a reason both stop presenting as Coverage, while remaining
   readable as distinct records. Two explicit columns plus `chk_purchase_drafts_closure_path` make
   the two paths mutually exclusive and make "Arrival Confirmation happens at most once" visible on
   the row, rather than inferred from whether any line has a `received_quantity`.
3. **`purchase_draft_id` denormalized onto the link.** Justified by the §6.5 400 ms p95 target — it
   removes a join hop from the Coverage aggregation — and kept honest by the composite foreign key,
   so it cannot disagree with the line's draft. Not a cache.
4. **Attribution foreign keys are not indexed.** No read filters on them, `users` rows are never
   deleted (RESTRICT, and no delete path exists in this feature), and the repo already leaves such
   keys unindexed — `warehouse_memberships.user_id` has a foreign key but no dedicated index.
   Indexing them would violate the "no index without a concrete query" rule.

## Unresolved / carried forward

- **Confirm decision 1** (one link per line-order pair) with the Tech Lead. If two links on one pair
  must be allowed, drop `uq_purchase_draft_line_links_line_order` and re-key the Demand Snapshot and
  the Allocation, which currently rely on the link being the unique address of that intention.
- **The non-fan-out demand query is not a schema guarantee.** The schema and indexes support it, but
  the two one-to-many aggregations (`sad.md` §6.5, and its own "flags raised" note) must be aggregated
  separately and then joined. If written as a single `GROUP BY` over both joins, every total is
  silently multiplied. This is a **correctness** risk, not a performance one, and needs an integration
  test asserting exact totals against known fixtures — carried to `plan-tests` and `tasks`.
- **Lock statements are repository code, not schema.** The fixed order from `sad.md` §8 — draft, then
  lines, then Customer Orders in ascending identifier order — must be implemented identically in the
  arrival and the amendment paths. The indexes make each step an indexed lookup; nothing in the schema
  can force the ordering.
- **The Stock reconciliation question** (`spec.md` §8) stays open. `item_stock_adjustments` is
  deliberately append-only and carries count, reason, member and time so that either answer remains
  implementable. This model asserts nothing about which is taken.
- **`ErrorCode` members** namespaced `items.*`, `customer_orders.*`, `purchase_drafts.*`
  (`sad.md` §5) are not part of this stage; `api` owns them.

## Definition of Done

- [x] Model links to and conforms with system persistence architecture; PostgreSQL + TypeORM only.
- [x] Every schema change has a staged TypeORM migration class with reversible `up` / `down`,
      verified by an actual apply → revert → re-apply cycle.
- [x] `synchronize` is never enabled; no MongoDB/Mongoose artifact introduced.
- [x] No design-stage migration written into the live tree.
- [x] Every index justified by a named query; no speculative indexes.
- [x] Drift and safety checks reported with evidence.
