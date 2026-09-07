# Data-model audit — arrival-inspection — 2026-09-07

Work item: `feature` / `arrival-inspection` (`.size` = L, `.route` = full).
Inputs read in full: `spec.md`, `sad.md`, `CONTEXT.md`, `adr/0001-payload-conditional-permission.md`,
`design-handoff.md` (design-decision section), `docs/system/server-index.md`,
`docs/system/server-architecture.md` §Persistence, `docs/system/guides/creating-a-server-repository.md`,
`apps/server/migrations/README.md`, all fifteen shipped migrations, the shipped entities for
`purchase_draft_lines`, `packaging_types`, `arrival_allocations`, `item_stock_adjustments` and
`customer_orders`, `arrival-confirmation.repository.ts`, `packaging-type-catalogue.repository.ts`,
`purchase-draft-read.repository.ts`, `docs/features/delivery-addresses/data-model.md`, and
`packages/shared-types/src/enums/permission-id.ts`.

## Staged migrations

| File                                                    | Class                                            | Objects                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `migrations/01-create-arrival-inspection-schema.ts`     | `CreateArrivalInspectionSchema1786800000000`     | 2 tables, 10 seeded catalogue rows, 2 added columns on a populated relation, 13 checks, 4 FKs, 2 unique constraints |
| `migrations/02-grant-arrival-inspection-permissions.ts` | `GrantArrivalInspectionPermissions1786800100000` | 3 `permissions` rows + one idempotent grant to every protected `warehouse_manager` Role                             |

Measured against the applied database: **13 check constraints, 4 foreign keys, 2 unique constraints,
3 indexes on the new relations** (two primary keys and one unique). No shipped constraint is replaced
and no shipped migration is edited.

Neither is in the live tree. Promotion is a rename only — the class names already carry the planned
timestamps, which sort after the last shipped migration (`1786700300000`).

## Verification performed

The environment matters and is stated first: **Docker is not available on this machine and no
PostgreSQL server was running.** A throwaway PostgreSQL cluster was started from the locally
installed `postgresql@14`, on port 55432, with its data directory in the session scratchpad and its
Unix socket in a short path (`/tmp/wh-ai-sock`) because the scratchpad path exceeds the 103-byte
socket limit.

1. **Typecheck.** Both files compile under `tsc --noEmit --strict` (exit 0) from inside
   `apps/server`, and again under the `ts-node` type-checking loader that `typeorm-ts-node-commonjs`
   uses to execute them.
2. **Apply (empty).** Both applied cleanly on top of the fifteen shipped migrations.
3. **Apply (populated) — the case that matters here.** The fifteen shipped migrations were applied
   alone, then seeded with rows that predate this release: 1 Workspace, 1 user/account, 1 Warehouse,
   1 Item, 1 Closed Purchase Draft, 1 Customer (`Acme Ltd`) with 1 Delivery Address
   (`1 Depot Road, Springfield`), and 3 Purchase Draft Lines — one Via Warehouse line **with an
   ending already recorded** (100 received, no condition data), one Via Warehouse line frozen
   carrying `packaging_type_id = 'pallets'` and no ending, and one Direct to Customer line with no
   ending. Both staged migrations then applied over those rows. Verified afterwards:
   - the pre-release ending is **untouched**: `ending_quantity = 100`, `ending_kind = 'arrival'`,
     both conformance columns `NULL` — nothing was backfilled, which is `spec.md` §8's tenth question
     at its stated default;
   - all five conformance checks and the composite unique validated against the populated table
     without failing;
   - 10 catalogue rows seeded, exactly 1 carrying `requires_description`;
   - 3 `REJECTIONS:*` rows in `permissions`, all `assignable`.
4. **Grant idempotency.** A protected `warehouse_manager` Role was seeded and `02`'s
   `INSERT … SELECT … NOT EXISTS` was run twice: 3 grants after the first, `INSERT 0 0` and still 3
   after the second.
5. **Revert (populated, with this release's own rows present).** A Pre-receipt Conformance and a
   Rejection carrying a description, an amended Disposition and its attribution were written first,
   then both migrations reverted cleanly. Verified: both new tables gone; both conformance columns
   gone; all six new constraints on `purchase_draft_lines` gone; zero `REJECTIONS:*` rows in
   `permissions` and zero in `role_permissions`; all 3 seeded lines and the pre-release ending intact
   (`100 / arrival`).
6. **Replay.** Both re-applied after the revert, back to 10 catalogue rows, 3 Permissions, 13 checks
   and 4 foreign keys.
7. **Constraint probes.** 41 statements were run against the applied schema, each asserted to be
   accepted or rejected. **41/41 as expected.** Every rejection was attributed to the named
   constraint, and every case the specification requires to be _permitted_ was confirmed permitted.
8. **Plan checks.** Two queries were `EXPLAIN`ed with `enable_seqscan = off`; each uses the index
   created for it (below).
9. **Behaviour probes.** The derived Accepted Quantity and the Disposition's conditional update were
   exercised as statements rather than as constraints (below).
10. **Drift scan.** Column-by-column, `purchase_draft_lines` entity against the shipped schema.
11. **Mermaid.** `mmdc` is not installed in this repo, so the fallback structural path from
    `_shared/mermaid-check.md` ran: one `erDiagram` declaration, 6 uniquely named attribute blocks
    each participating in a relationship and no participant lacking a block, 8 well-formed
    relationship lines, 36 attribute lines of which 36 are well-formed, balanced braces once the 8
    `||--o{` arrows are discounted, no unresolved template placeholders.
12. **Cleanup.** The cluster, its data directory, its socket directory, the scratch data-source, the
    patched baseline copy, the typecheck copies and all probe scripts were removed. The working tree
    contains only `docs/features/arrival-inspection/` additions.

### The one verification this environment could not perform

The repository targets **PostgreSQL 17** (`docker-compose.yml`, `postgres:17-alpine`), and the
shipped `1786525200000-AddActiveWarehouseSelection` uses `ON DELETE SET NULL (column_list)`, which is
**PostgreSQL 15+ syntax**. On PostgreSQL 14 that migration fails, so the baseline could not be
replayed as shipped.

For the harness only, a copy of that one file with `ON DELETE NO ACTION` was used. It touches
`users.active_warehouse_id` and no relation this feature changes, so it cannot affect any result
above. Nothing in the two staged migrations uses syntax newer than PostgreSQL 9.x — composite foreign
keys, check constraints, `char_length`, `CASE` inside a `CHECK`, and plain `ALTER TABLE … ADD COLUMN`
— so the PostgreSQL 14 results are expected to hold on 17.

**Carried forward:** re-run apply / revert / replay against a real PostgreSQL 17 before promoting
these files into `apps/server/migrations/`. `sad.md` §10 already requires migrations to be verified
against the real development database **and reverted with pre-existing endings present**; that second
half is discharged here on 14 and not yet on 17.

### Constraint probes in detail

41 probes, grouped as they were run. Every line below was asserted in both directions — the schema
either accepted or rejected it, and the expectation matched.

**`rejection_reasons` (5).** Blank label refused; untrimmed label refused; a new Reason inserts
(extend-only is a convention, not a lock); **deleting a Reason a Rejection names is refused by
`fk_purchase_draft_line_rejections_reason`**; deleting an unused Reason is permitted — which is
precisely the half of extend-only the database does _not_ enforce, recorded in `data-model.md`.

**Quantity, Reason and Source vocabulary (5).** A whole positive refusal accepted; zero refused;
negative refused; a Reason outside the catalogue refused; a Source outside the vocabulary refused.

**AC-09, one Rejection per Reason per line (3).** Two refusals on one line sharing a Reason refused;
two refusals on one line with different Reasons accepted; the same Reason on two different lines
accepted — the constraint is per line, not global.

**AC-25, Source follows Delivery Mode (4).** Customer-reported on a Via Warehouse line refused;
Customer-reported on a Direct to Customer line accepted; Inspected on a Direct to Customer line
refused; **and a row lying about its line's Delivery Mode to obtain the Source it wants is refused by
the composite reference** — which is what makes the check unbypassable rather than merely present.

**AC-26, Warehouse ownership (2).** A Rejection naming another Warehouse refused; a Rejection on a
line that does not exist refused. Both fail identically, disclosing nothing.

**AC-14, description (4).** 1 000 Cyrillic characters accepted; 1 001 refused; blank refused;
untrimmed refused. Run in Cyrillic deliberately: an `octet_length` bound would have refused the
1 000-character case, and it did not.

**AC-18/AC-19, disposition and attribution (5).** A new Rejection defaults to `undecided`; a
disposition outside the vocabulary refused; `held_for_return` with attribution accepted; an amendment
naming a member with no time refused; an amendment carrying a time with no member refused.

**AC-17/AC-17a, conformance against the frozen instruction (5).** An uninstructed line judged `met`
refused; an uninstructed line judged `not_applicable` accepted; an instructed line judged
`not_applicable` refused; an instructed line judged `not_met` with a note accepted; a verdict outside
the vocabulary refused.

**AC-04a, a nothing-received line carries no judgement (3).** A line with no ending judged refused;
an ending recording zero received and a judgement refused; an ending recording zero received with no
judgement accepted.

**AC-15b, the conformance note (4).** 1 001 characters refused; 1 000 accepted; a note with no
verdict refused; a blank note refused.

**Pre-release rows (1).** Asserted directly: **zero** lines exist carrying an ending and a
conformance, i.e. nothing was backfilled.

### Behaviour probes

Two rules `data-model.md` records as _inexpressible in the schema_ were still exercised as statements,
so the enforcement mechanism is evidenced rather than asserted:

- **The derived Accepted Quantity.** `ending_quantity − COALESCE(SUM(rejections), 0)` over the seeded
  line returned `received=100, rejected=8, accepted=92` — AC-01's arithmetic end to end. Over the
  same line **before** any Rejection existed it returned `received=100, accepted=100,
has_condition_split=false`, which is `spec.md` §8's tenth question answered with no branch.
- **The Disposition's conditional update.** With the predicate
  `(disposition = 'undecided' OR :disposition <> 'undecided')`: decided → another decision affected
  **1** row; decided → `undecided` affected **0**. AC-18a's typed refusal has its zero-row path.

### Plan checks

Both with `enable_seqscan = off`, on a table seeded with several Rejections:

| Query                                                             | Plan                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| One line's Rejections (§6.3)                                      | `Index Scan using uq_purchase_draft_line_rejections_line_reason`        |
| One Rejection by identifier in one Warehouse, `FOR UPDATE` (§6.4) | `LockRows → Index Scan using <primary key>`, `warehouse_id` as a filter |

No index was created that no query above needs, and the two indexes not created are argued in
`data-model.md` § Indexes deliberately **not** added.

## Conventions detected and followed

- Entities carry column names and types only; every `CHECK`, `DEFAULT` and collation lives in the
  migration. Both staged files follow it, and this is why `migration:generate` must never be run.
- Persistence-oriented value unions are declared beside their column in the entity file
  (`PurchaseDraftLineDeliveryMode`, `CustomerOrderState`), so `shared/domain/repositories/` and the
  feature module read them without either depending on the other. `RejectionSource`,
  `RejectionDisposition` and `PreReceiptConformance` follow it.
- Composite reference targets are named `uq_<table>_<columns>` and exist to be pointed at
  (`uq_purchase_draft_lines_id_draft_warehouse`, `uq_customer_delivery_addresses_id_warehouse`).
  `uq_purchase_draft_lines_id_warehouse_mode` is the third.
- Attributed rows carry `<verb>_by_user_id` with `created_at` as the time
  (`arrival_allocations`, `item_stock_adjustments`). Optional attribution is a paired `CHECK`
  (`chk_purchase_draft_lines_ending_attribution`). Both are followed.
- Free text is `text`, `<> ''` and `= btrim(...)`, in a `…_stored_trimmed` check.
- New tables use TypeORM's `Table`/`TableCheck`/`TableForeignKey`/`TableUnique` API; alterations to a
  shipped table use raw SQL. Both precedents are in `1786600000000` and `1786700100000` respectively,
  and both are used here for the same reasons.
- Permission catalogue extension follows `migrations/README.md` and
  `1786700200000-GrantDeliveryAddressPermissions` statement for statement.
- Primary key constraint names are TypeORM-generated (`PK_<hash>`) on every shipped table created
  through the `Table` API; the new tables match rather than hand-naming theirs.

## Deviations from existing convention

- **`char_length` bounds on two prose columns.** No shipped prose column is bounded at all — a
  Purchase Draft's closure reason, a Customer Order's cancellation reason and an On-hand adjustment's
  reason are unbounded in both contract and column. `spec.md` §5 (AC-14, AC-15b) requires the two
  columns this feature adds to be bounded, and `spec.md` §8's eleventh question takes the explicit
  default of bounding only these two. **The product's free-text fields therefore disagree from the
  day this lands**, which is recorded as a known inconsistency and not repaired here.
  `octet_length` was rejected in favour of `char_length` because the specification says characters
  and the product ships Ukrainian.
- **A three-column composite reference target**, where every existing one is two or (for
  `uq_purchase_draft_lines_id_draft_warehouse`) three columns of pure identity. This one carries a
  _value_ column, `delivery_mode`, so that AC-25 becomes a check. That is a small widening of the
  pattern and the reason is stated in `data-model.md`.
- **A `CASE` expression inside a `CHECK`.** No shipped check uses one; they use `OR` chains. The
  instruction rule is genuinely a two-branch classification and an `OR` chain expressing it reads
  worse. No portability or version concern applies.

## Drift detected

**None.** `PurchaseDraftLineEntity`'s eighteen columns match the shipped schema exactly in name,
type and nullability — the entity gains the two new columns as an implementation task, which is not
drift. No shipped `chk_*`, foreign key or unique constraint disagrees with the entity definitions in
the tables this feature touches. `packaging_types` and `arrival_allocations` likewise match.

The `migration:generate` probe was **not** re-run: `docs/features/delivery-addresses/_audit/` records
its 368-statement destructive output against the same entities and the same convention, and nothing
in this release changes the inputs to it.

## Destructive-change sequencing

**There is none.** Every change to a populated relation here is widening: two nullable columns with
no backfill, five checks all guarded by `IS NULL` on a column that is `NULL` in every shipped row,
and one unique constraint led by the primary key. Nothing is renamed, nothing is dropped, no column
becomes `NOT NULL`, and no expand / backfill / contract sequence is needed — so unlike
`delivery-addresses`, no migration is held back for a later task and there is no deferred contract
half.

The one ordering requirement is **inside** `01`: the composite unique on `purchase_draft_lines` and
the seeded catalogue are both created before `purchase_draft_line_rejections`, because that relation
references both. The `down` reverses exactly, dropping the Rejection relation first. Verified by the
revert, which would have failed on `ON DELETE RESTRICT` otherwise.

`02`'s `down` deletes grants before catalogue rows, for the same `RESTRICT` reason
`migrations/README.md` documents.

## Decisions taken where the sources were silent

- **`requires_description` is catalogue data** (`sad.md` §11 asked for confirmation here).
  Confirmed, with the alternative and its cost recorded in `data-model.md`.
- **The Accepted and Rejected Quantities are not materialized** (`sad.md` §7 left it open). Not
  materialized; the deciding reason is that a stored column would end `spec.md` §6.1's "Refusal as a
  route around the Allocation bound" as a structural property.
- **`spec.md` §8's tenth question needs no migration and no read branch.** The derivation absorbs it;
  the read's discriminator is `pre_receipt_conformance IS NULL`. Verified, not argued.
- **No database rule enforces extend-only on the catalogue** (`sad.md` §7 left it to this stage). The
  `RESTRICT` foreign key covers deletion of a used Reason; a trigger or a revoked privilege would be
  the repository's first of either, for a rule whose only author is the migration directory. The
  architecture check `sad.md` §10 already requires is the enforcement.
- **`purchase_draft_id` is not carried on a Rejection.** No read named in `sad.md` §6 reaches one by
  draft.
- **`rejection_reasons.id` is `varchar(32)`**, matching `packaging_types`. The longest seeded
  identifier is 29 characters (`value_adding_note_not_applied`); a future Reason needing more is a
  schema change, which is acceptable for a catalogue only migrations extend.
- **The catalogue has no `sort_order` column.** It is read whole and ordered by `id`, exactly as
  `PackagingTypeCatalogueRepository` reads its own. Display order is not a persistence concern here,
  and inventing one would be an index and a column no read asks for.

## Unresolved / carried forward

- **Re-run apply / revert / replay against PostgreSQL 17** before promotion (above).
- **`api` owns "a conformance note only under a Not met verdict."** It is expressible on this row and
  deliberately not expressed, because no `AC-*` names a refusal for it and a bare constraint
  violation would have no named predicate or stable `ErrorCode`. The request schema is its natural
  home. `data-model.md` § Constraints the model deliberately does **not** express records it.
- **`plan-tests` owns the absent case explicitly.** A line whose ending predates this release carries
  no Condition Split, and `aPreReleaseEnding` exists as a factory so that branch is opted out of
  rather than into. `sad.md` §10 also requires the migration to be applied **and reverted** with such
  rows present — discharged here on 14, carried forward for 17.
- **The change request `spec.md` §8 (first question) and `sad.md` §11 both require still does not
  exist.** This model implements `spec.md`'s wording as the proposed amendment, and it adds nothing
  new to that list: `data-model.md` asserts no rule about `ordering` or `delivery-addresses` beyond
  what `sad.md` already carries. It does, however, make one of the seven items concrete — a Closed
  draft's Rejection is an ordinary `UPDATE` target, and `chk_purchase_drafts_closure_path` and every
  "frozen after Ready for Ordering" statement are silent about it. PM, before `tasks`.
- **`spec.md` §6's four p95 targets remain unmeasured**, for the reason `sad.md` §8 and §11 give:
  production timing is forbidden and no performance tier exists. Nothing in this model adds a timing
  mechanism. The two plan checks above are the evidence that the reads are indexed, not that the
  targets are met.
- **PGlite proves none of the concurrency claims.** The `uq_purchase_draft_line_rejections_line_reason`
  race and the Disposition's zero-row path were probed here against a real server as _statements_;
  the true concurrent race stays unproven in the automated suite until a real-PostgreSQL tier returns.

## Definition of Done

- [x] The model links to and conforms with `docs/system` persistence architecture: PostgreSQL,
      TypeORM, `shared/domain/` entities and specialized repositories, forward-only migrations,
      `synchronize` disabled. No MongoDB/Mongoose artifact and no runtime synchronization is
      introduced.
- [x] Every schema change has a staged TypeORM migration implementing `MigrationInterface` with
      reversible `up`/`down`, verified by apply → revert → replay against a real server with rows
      present on both sides.
- [x] Every foreign key is either indexed or its absence argued against a named read.
- [x] Drift between the documented model, the entities and the shipped migrations was scanned and
      reported: none.
- [x] Destructive-change sequencing reported: none required, and why.
- [x] Every constraint `sad.md` §7 listed is expressed or explicitly rejected as inexpressible, each
      rejection naming what enforces it instead.
- [x] Mermaid validated (structural fallback path; `mmdc` unavailable).
- [x] No real-looking PII in any seed, fixture or example.
