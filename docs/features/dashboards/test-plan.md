---
status: Draft
owner: 'QA'
reviewers: ['Backend Lead', 'Frontend Lead', 'Tech Lead']
updated_at: '2026-09-21'
feature_size: 'L'
---

# Test plan — dashboards

Eight derived reads and one Workspace Permission: four Warehouse Panels authorized by the watch
Permissions that already govern the records they aggregate, four Workspace Panels authorized by one
new Workspace-level Permission, nothing written anywhere but that Permission's catalogue row and its
grant. What has to be proven is therefore not behaviour but **arithmetic, absence and disclosure**:
that each figure counts what it says and nothing beside it, that a Panel an actor may not read is
not there at all, and that every record a Panel leaves out is reported on that Panel as a count.

## Levels

| Level             | Scope                                                                                                                                                                                                | Strategy (generic — no tool names)                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Pure logic: the panel-access predicates, the Age Band and Urgency Band boundaries, the on-time verdict, the scale helpers, the loader's dispatch decision. No I/O.                                   | In-memory against repository doubles.                                                                                              |
| Integration       | The SQL. Every aggregation rule, every exclusion count, every ordering and bounding rule, and the two migrations applied and reverted.                                                               | An ephemeral real PostgreSQL, in-process, one freshly migrated database per spec file — never a mocked store.                      |
| Contract          | Each of the eight endpoints' response shape and its authorization boundary — required Permission, observed Permission on both sides, archived tolerance, and the absence of any Customer field.      | The real endpoint booted against the same ephemeral database, asserted against the shared contracts subpath the web side consumes. |
| Component         | Each Panel rendered from a fixed projection, the shell's reflow at one, three and four permitted Panels, the denial surface, the archived strip, every exclusion and disclosure footnote.            | Render in a component harness; assert rendered output and accessible structure, no full app boot.                                  |
| Load              | The three numeric §6 latency targets.                                                                                                                                                                | A real PostgreSQL deployment seeded to the §1 scale, driven by the load tool the deployment adopts (e.g. k6 or Locust).            |
| E2E               | <!-- N/A: no end-to-end tier exists in this repository and this feature does not introduce one; the flow is covered by contract at the boundary plus component on the surface. -->                   | —                                                                                                                                  |
| Visual-regression | <!-- N/A: no baseline-diff tier exists in this repository and this feature does not introduce one; the one-screen layout rests on the component reflow checks plus the recorded design approval. --> | —                                                                                                                                  |
| E2E-through-UI    | <!-- N/A: no browser-driven tier exists in this repository and this feature does not introduce one. -->                                                                                              | —                                                                                                                                  |

The three N/A tiers are a decision, not an oversight: the web surface is verified at component and
unit level, the boundary at contract level, and neither the 1280 × 800 one-screen target nor the
colour-legibility target is measured by a diffed image. What that leaves unproven is stated in
[What this plan cannot prove](#what-this-plan-cannot-prove).

## AC coverage

Every acceptance criterion in `spec.md` §5 maps to at least one row. Levels follow `sad.md` §10,
which already fixed the tier per rule.

| AC (spec.md §5)         | Test name (intent-based)                                                                          | Level            | Expected outcome                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| AC-01 happy path        | four permitted Panels are presented together and the surface offers no control                    | component        | The four Panels render from their projections; no control, no chooser and no copy beyond each Panel's labels and counts       |
| AC-01 happy path        | a member holding every watch Permission is admitted by all four Warehouse Panel reads             | contract         | Each of the four reads answers with its Panel's figures                                                                       |
| AC-02 authorization     | a member whose Permissions admit no whole Panel is refused the surface                            | unit             | The panel-access predicates admit no Panel, so the surface resolves to a denial rather than to an empty set of Panels         |
| AC-02 authorization     | the denial states only that the figures are not permitted                                         | component        | A statement and nothing else: no chart frame, no axis, no total, no named Permission, no hint of what the Warehouse holds     |
| AC-02 authorization     | each Warehouse Panel read is refused without its required Permission                              | contract         | Refused before any figure is computed, disclosing nothing about the Warehouse's contents                                      |
| AC-02a authorization    | a Purchase-Drafts-only member is admitted to the Purchasing Pipeline alone                        | unit             | Exactly one Panel is admitted; the other three are absent rather than empty                                                   |
| AC-02a authorization    | the surface reflows to one Panel with no trace of the three withheld                              | component        | The single Panel occupies the surface; no frame, gap, title, zero or count reports that anything was withheld                 |
| AC-03 happy path        | the Coverage Gap shows ten Items in a total order with a counted Remainder Row                    | integration      | Ten Items ordered by uncovered quantity, then outstanding quantity, then SKU; the rest in one row stating how many it holds   |
| AC-03 happy path        | the Coverage Gap renders its ten rows and its Remainder Row as a table                            | component        | Each row divided into on-hand, inbound and uncovered; the Remainder Row states its Item count                                 |
| AC-04 domain invariant  | a cancelled Customer Order's retained outstanding quantity reaches no owed figure                 | integration      | It contributes to no Coverage Gap quantity and to no Urgency Band on either surface                                           |
| AC-04 domain invariant  | the same cancelled Order stays in its Order Flow week as the withdrawn part                       | integration      | Its quantity is in the week it was recorded, presented as withdrawn and never as demand still carried                         |
| AC-05 domain invariant  | a fully covered Item reports nothing uncovered rather than a surplus                              | integration      | Uncovered quantity is nothing, never negative; the Item orders below every Item with something uncovered                      |
| AC-05 domain invariant  | a zero-uncovered Item renders without a negative or a surplus segment                             | component        | The row shows on-hand and inbound only                                                                                        |
| AC-06 domain invariant  | Inbound Quantity is the quantity ordered on the lines, not the quantity the links claim           | integration      | Reports the open lines' ordered quantity; no figure is derived from the link quantities, however they add up                  |
| AC-06a domain invariant | an Item with several Orders and several Lines reports the quantities of one of each               | integration      | Every quantity equals the single-record case — the headline aggregation-integrity assertion                                   |
| AC-07 happy path        | Arrival Timing shows an Overdue bucket, eight weeks, and what is owed beyond them                 | integration      | Nine buckets of owed quantity plus a stated beyond-horizon quantity and Order count placed in no week                         |
| AC-07 happy path        | expected arrivals are read from the drafts standing in Ready for Ordering when read               | integration      | A draft since Closed contributes nothing; a draft readied late falls in the first bucket                                      |
| AC-07 happy path        | Arrival Timing renders two never-netted series across its nine buckets                            | component        | Owed and expected presented beside each other, neither subtracted from the other                                              |
| AC-08 domain invariant  | a Direct to Customer line counts inbound but never at the dock                                    | integration      | Both lines raise the Item's Inbound Quantity; only the Via Warehouse line raises what is expected to arrive                   |
| AC-08a domain invariant | undated and still-in-Draft drafts are excluded from the weeks with their own counts               | integration      | Neither is placed in a week; each exclusion's draft count and quantity are reported                                           |
| AC-08a domain invariant | the Arrival Timing response carries each exclusion as a field of its own                          | contract         | The exclusion counts are response fields, not a second read and not a client derivation                                       |
| AC-08a domain invariant | the Panel states both exclusions in its footnotes                                                 | component        | Both counts rendered, so the weeks are never read as the whole of what is on order                                            |
| AC-09 error             | a stale link naming no enterable Warehouse offers a Warehouse instead of an error                 | unit             | Resolves to the last-entered Warehouse, else to a choice among the enterable ones, else to the no-membership statement        |
| AC-09 error             | none of the three outcomes says whether the named Warehouse exists                                | component        | Each presentation discloses nothing about the Warehouse the link named — a regression guard over inherited behaviour          |
| AC-10 happy path        | the Purchasing Pipeline divides the two open states into four Age Bands                           | integration      | A draft readied yesterday after a month in Draft reads as a day old                                                           |
| AC-10 happy path        | the Age Band boundaries are exact at each edge                                                    | unit             | Each boundary falls in exactly one band, computed against the one bound timezone parameter                                    |
| AC-11 domain invariant  | Closed and Discarded drafts reach no Warehouse figure                                             | integration      | The Pipeline and every Inbound Quantity count only Draft and Ready for Ordering                                               |
| AC-12 happy path        | Reason Concentration orders Reasons by refused quantity with a running share                      | integration      | Both Rejection Sources counted; Undecided and end-customer quantities distinguished within each Reason                        |
| AC-12 happy path        | the eleventh Reason onward becomes one counted Remainder Row, and none before                     | integration      | A Remainder Row stating its Reason count appears only once a Reason falls beyond the tenth                                    |
| AC-12 happy path        | Reason Concentration renders as a table with its two distinguished quantities                     | component        | Each Reason's Undecided and end-customer parts labelled separately, never summed into one                                     |
| AC-13 authorization     | a member without the Rejections watch is admitted to the other three Panels                       | unit             | Three Panels admitted, Reason Concentration not admitted                                                                      |
| AC-13 authorization     | nothing at all stands where Reason Concentration would                                            | component        | No frame, no title, no count; the three Panels reflow as though the fourth had never been there                               |
| AC-13 authorization     | the Reason Concentration read is refused without its Permission                                   | contract         | Refused, disclosing neither that refusals exist nor how many                                                                  |
| AC-14 happy path        | Demand Pressure shows one bar per active Warehouse on a scale of quantities                       | integration      | Each Warehouse split into Overdue, due soon and due later; archived Warehouses excluded and their count reported              |
| AC-14 happy path        | the Demand Pressure bars are not normalized to shares                                             | component        | A small Warehouse in trouble is not flattened beside a large healthy one                                                      |
| AC-15 authorization     | a Workspace Member without the observation Permission is refused every Workspace read             | contract         | All four reads refused before any figure is computed                                                                          |
| AC-15 authorization     | the Workspace denial names no Warehouse and no quantity                                           | component        | The denial reveals neither how many Warehouses the Workspace holds nor whether any has anything outstanding                   |
| AC-16 happy path        | Order Flow pools twelve weeks across the Workspace and names no Warehouse                         | integration      | Each week holds what its Orders now ask for, with the assigned and cancelled parts within that whole                          |
| AC-16 happy path        | the cancelled part renders as withdrawn from its week                                             | component        | Never presented as a quantity the Workspace still owes                                                                        |
| AC-17 domain invariant  | three arrivals in three weeks report against the recording week                                   | integration      | The three assignments are summed into the Order's own week; the three arrival weeks hold nothing                              |
| AC-17 domain invariant  | the figure is labelled quantity assigned, never orders fulfilled                                  | component        | No label claims the Order was satisfied in any week                                                                           |
| AC-17a domain invariant | an amended Order reports its current quantity in its original week                                | integration      | The week reports what the Order asks for now, not what it asked for then                                                      |
| AC-17a domain invariant | Order Flow states on the Panel that its weeks are retroactive                                     | component        | The disclosure is rendered on the Panel itself                                                                                |
| AC-18 happy path        | Purchasing Spread counts every Warehouse against every draft state                                | integration      | Closed and Discarded counted here and nowhere else, so an abandoning Warehouse is distinguishable from a starved one          |
| AC-18 happy path        | every Warehouse × state pairing renders with its draft count                                      | component        | No pairing omitted and no Remainder Row, the Warehouse population being bounded                                               |
| AC-19 happy path        | Receipt Reliability positions one labelled mark per Warehouse and sizes it by quantity            | integration      | Both rates read over the whole retained record; the received quantity supplied as an absolute                                 |
| AC-19 happy path        | every mark carries its Warehouse's name rather than a legend key                                  | component        | Readable with no legend consulted                                                                                             |
| AC-20 domain invariant  | the two rates exclude undated, unrecorded and Not-applicable lines with stated counts             | integration      | Each exclusion removed from both parts of its own rate rather than counted as a failure, and its coverage reported            |
| AC-20 domain invariant  | each exclusion is a field of the Receipt Reliability response                                     | contract         | Every exclusion count carried in the response, not derived on the client                                                      |
| AC-20 domain invariant  | the Panel states how much of the record each exclusion covers                                     | component        | All exclusion footnotes rendered                                                                                              |
| AC-20a domain invariant | a Warehouse admitting no line reports no rate rather than zero                                    | integration      | Neither rate is computed for it; it is not placed at nothing and not at everything                                            |
| AC-20a domain invariant | a Warehouse with no rate renders as having none                                                   | component        | Presented as unreportable, never as the worst or the best performer                                                           |
| AC-20b domain invariant | the on-time verdict is the recorded ending against the draft's Expected Arrival Date              | unit             | Timely and late decided against the one bound timezone parameter                                                              |
| AC-20b domain invariant | a line with no ending, one receiving nothing, and a Direct to Customer line count in neither part | integration      | Each enters neither numerator nor denominator of the On-time Arrival Rate                                                     |
| AC-21 happy path        | a Role granted the observation Permission may read the figures and administer nothing             | integration      | Holders read every Workspace Panel and can change no role, member or Warehouse                                                |
| AC-21 happy path        | the newly granted Role is admitted by the Workspace reads and refused by administration           | contract         | Admitted to the four reads, still refused every administrative operation                                                      |
| AC-21a cross-context    | the release grants the Permission to every Workspace Owner Role and to no custom Role             | integration      | Migration applied and reverted; the catalogue row present as assignable; grants on owner Roles only, with no person acting    |
| AC-22 authorization     | a Workspace holder with no Warehouse membership is admitted                                       | contract         | Admitted, because the authority is held in the Workspace and not assembled from memberships below it                          |
| AC-22 authorization     | a Warehouse Member holding every watch Permission and no Workspace Role is refused                | contract         | Refused, because authority in one Warehouse says nothing about the Workspace above it                                         |
| AC-23 cross-context     | an archived Warehouse serves its Panels on the Permission terms that applied before               | contract         | Each Warehouse read succeeds with archived tolerance declared and is refused without it                                       |
| AC-23 cross-context     | the archived Warehouse is marked as archived and offers nothing that changes it                   | component        | The archived marking renders where it already renders; the surface offers no operation                                        |
| AC-24 authorization     | a member acting in one Warehouse cannot read another Warehouse's figures                          | contract         | Refused even though the member holds every watch Permission there, disclosing nothing about its contents                      |
| AC-25 cross-context     | a deactivated Item appears in the Coverage Gap exactly as an active one                           | integration      | Its outstanding and on-hand quantities are shown; deactivation withdraws nothing already promised                             |
| AC-26 cross-context     | a read after a recorded, amended or readied change reflects that change                           | integration      | No figure is carried over from before the change                                                                              |
| AC-26 cross-context     | the surface issues its reads on entry and none after it is presented                              | unit + component | The loader dispatches exactly the permitted reads and nothing on a refused verdict; the page mounts with data already present |

## Edge cases / error paths

Each authorization and error criterion above already holds its own dedicated rows. These are the
boundary cases the spec and the model imply beyond them:

- A member holding some watch Permissions but no Panel's whole set (AC-02) → expected: the denial,
  not a partial Panel — the conjunction is asserted on **both** sides of every member of each set.
- A link naming a Warehouse that exists but is not the member's, versus one that exists nowhere
  (AC-09, AC-24) → expected: the same outcome and the same words for both, so the pair is
  indistinguishable.
- A member with no Warehouse membership at all following a Warehouse link (AC-09) → expected: told
  they hold no Warehouse membership, with no Warehouse named.
- A Workspace whose every Warehouse is archived → expected: each Workspace Panel reports no
  Warehouse and states the archived count as its own field, rather than refusing or rendering empty.
- A Warehouse holding no Unfulfilled Order, no open draft and no Rejection → expected: each
  permitted Panel presents its own nothing, distinguishable from the AC-02 denial.
- Ten or fewer Items, and exactly eleven (AC-03, AC-12) → expected: no Remainder Row below the
  threshold, and a Remainder Row counting exactly one at it.
- Two Items uncovered by the same quantity with the same outstanding quantity (AC-03) → expected:
  SKU decides, so two readers at the same moment see the same order.
- Demand owed beyond the eighth week, and a Warehouse with only such demand (AC-07) → expected:
  stated as a beyond-horizon quantity and Order count, placed in no week.
- A Purchase Draft readied after its Expected Arrival Date has already passed (AC-07) → expected:
  the first bucket, per the `sad.md` §6 flag that resolved it.
- An Order Flow week holding only cancelled quantity (AC-04, AC-16) → expected: the week's whole
  equals its withdrawn part, and no owed figure anywhere counts it.
- Both rates' denominators reaching nothing on one Warehouse while the other rate has lines
  (AC-20, AC-20a) → expected: one rate reported and one reported as none, independently.

## Test data

- **Seed strategy:** the five builders `data-model.md` § Test fixtures names, extending the
  `ordering`, `delivery-addresses` and `arrival-inspection` builders rather than replacing them —
  `anItemWithSeveralOrdersAndSeveralLines`, `aCancelledOrderWithRetainedOutstanding`,
  `aWarehouseWithNoAdmissibleLine`, `aDraftReadiedAfterALongDraftPeriod`, `aRejectionOfEachSource`.
  No new factory, because no new entity. The reads are seeded by **shape**, not by volume — volume
  belongs to the load scenarios below.
- **Integration dependency:** an ephemeral real PostgreSQL, in-process, one freshly migrated
  database per spec file, created from the migrated template. Never a mocked store: the whole
  integration tier here exists to test SQL, and a passing double would prove nothing about it.
- **Cleanup boundary:** per spec file — each file receives its own database, so no test cleans up
  after another and no ordering dependency can form. Within a file, each test seeds its own
  Warehouse so two tests cannot read each other's rows.
- **PII guard:** every seeded Customer name and address is `example.test` material, and no fixture
  in this feature reads a Customer column at all — which is also what the contract row asserting no
  Customer field in any response exists to keep true.

## Structural gates

Not a test level — static checks that pin their subjects as literals and **silently skip what they
do not list**, so each must be extended by hand or the new code ships unchecked with every suite
green (`sad.md` §10):

- `apps/web/src/test/loader-permission-parity/` — both new loaders added.
- `apps/web/src/test/module-boundaries/` — `modules/workspace-dashboard` added to `MODULE_MANIFEST`
  and `MODULE_SURFACE`.
- `apps/web/src/test/route-readiness/` — `ROUTES.WORKSPACE_DASHBOARD` added.
- `apps/server/src/dashboards/module-boundaries.spec.ts` — **created**; that spec is one file per
  module, so the new module has none until it is written.
- The tree-wide architectural tier needs no change and covers the new module as it stands: one
  query per file under the queries directory, no named mapper outside a mappers directory, every
  branch a named predicate. It is also what holds the read-only guarantee — no write path anywhere
  in the feature but the shipped Role Editor's.

## NFR validation (load)

Run against a real PostgreSQL deployment seeded to the `spec.md` §1 scale — roughly 2 000 Items,
5 000 Unfulfilled Customer Orders and 250 open Purchase Drafts per Warehouse, up to 20 Warehouses in
a Workspace — using the load tool the deployment adopts (e.g. k6 or Locust). The scale environment
`data-model.md` already built and measured against (238 950 Customer Orders, 120 000 Purchase Draft
Lines, 40 000 Purchase Drafts, 19 306 Rejections, 40 Warehouses) is the environment these run in.
Each scenario's **rate and duration are the scenario's own parameters**, chosen from the §1
population; `spec.md` §6 states thresholds and no throughput target, and none is invented here.

- **Authorization stage p95 ≤ 50 ms** → scenario: 20 concurrent actors each entering a surface once
  per 2 seconds — 10 surface entries per second, every entry exercising the guard for each Panel
  read it dispatches — sustained for 10 minutes across all eight protected reads; assert the
  authorization-stage p95 in the structured server timing logs ≤ 50 ms, for each of the eight.
- **Warehouse surface read p95 ≤ 600 ms** → scenario: 10 Warehouse entries per second, each
  dispatching the four Panel reads together for a fully permitted member, sustained for 10 minutes
  at the §1 per-Warehouse scale; assert the p95 of the four reads taken together ≤ 600 ms in the
  structured timing logs, excluding client network time, with no error-rate regression.
- **Workspace surface read p95 ≤ 900 ms** → scenario: 2 Workspace entries per second over a
  Workspace of 20 Warehouses each at the §1 scale, each entry dispatching the four Workspace Panel
  reads together, sustained for 10 minutes; assert the p95 of the four taken together ≤ 900 ms,
  excluding client network time.
- **Reason Concentration at Rejection volume** → the same Warehouse scenario above, run once with
  the Rejection population `spec.md` §1 never fixed and `data-model.md` seeded at 19 306; assert the
  600 ms threshold still holds and record the volume the reading was taken at, since the §6 target
  covers a Panel whose population is cumulative and never deleted.

The two staged migrations are additionally applied, reverted and replayed on this same deployment,
because a lock window on a populated relation is not observable on an in-process database.

## CI placement

- **On every PR:** unit, component, integration and contract — all four already run in the
  repository's gate and all four are in-process, so none of them needs an external service. Plus
  lint, the architectural tier and the four structural gates above, and the web build, which is the
  only check that fails on a half-registered contracts subpath while every suite stays green.
- **Pre-release, on the scale deployment:** the four load scenarios and the migration
  apply/revert/replay. These need a real PostgreSQL server and are not PR-gated.

Wiring is `implement`'s and the repository's CI to own; this is the split, not the configuration.

## What this plan cannot prove

Stated so a green gate is not read as more than it is:

- **The three §6 latency targets, from any suite.** The integration tier is a single-backend
  in-process database one major version ahead of production; `docs/system/server-architecture.md`
  § "What this tier cannot test" is explicit that latency and concurrency specs pass there for the
  wrong reasons. They are proven by the load scenarios above or they are not proven.
- **The one-screen layout at 1280 × 800.** No tier here measures rendered geometry. The component
  reflow checks prove which Panels are present and in what order at one, three and four permitted
  Panels; that the result fits one screen rests on the recorded design approval in
  `design-handoff.md`.
- **Colour legibility as a measurement.** The component tier asserts that every series carries a
  text label and that no figure is distinguishable by colour alone in the rendered structure; it
  does not measure contrast.
- **The `purchase_drafts.reference` ceiling.** `data-model.md` § Drift records a shipped defect that
  makes every Purchase Draft insert fail from the 10 000th, deployment-wide. It is not this
  feature's to fix, no test here covers it, and the load scenarios above cannot be seeded past it
  until it is fixed.
