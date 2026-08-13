---
status: Draft
owner: 'YuriiH'
reviewers: ['Frontend Lead', 'Tech Lead', 'Security Lead']
updated_at: '2026-08-13'
feature_size: 'L'
change_record: './change.md'
---

# Test plan — change-request: workspace-warehouse

The Warehouse an actor works in becomes an address-established context instead of a server-derived
selection: the switcher groups Warehouses under their Workspace, every Warehouse-scoped screen takes
its Warehouse from the route, entry is refused without disclosure when the actor holds no membership,
and landing resolves an actor's context instead of dropping everyone on a fixed route. This plan maps
every `CR-AC-*` and every `CR-RG-*` regression boundary in [`spec.md`](./spec.md) §5 and §5.1 to at
least one named test, and adds the proof that the removed behavior is no longer reachable.

## Levels

`sad.md` declares `target_surfaces: ['web-frontend']`, so the frontend tiers apply. The repository's
own tiers are component and in-process route integration; the browser-driven tiers are deliberately
not adopted here (decided at `plan-tests`, 2026-08-13) because `spec.md` §6 measures the two
viewport/latency targets manually and `sad.md` §10 prescribes route integration for every flow.

| Level             | Scope                                                                                                                                                                                | Strategy (generic — no tool names)                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit              | Pure logic with no I/O: the entry verdict, the landing rules, the entry-write comparison, the failure-alert allowlist.                                                               | In-memory. The guards are plain functions with no React imports; call them directly with a prepared context.                                                |
| Integration       | The web shell against the real dependencies it owns — the real router, the real store, the real components.                                                                          | Fresh store and memory-history router per test through `createAppRouter`, real reducers and real cache keys. See "Test data" for the one boundary answered. |
| Component         | A single UI unit exercised in isolation: the grouped switcher, the two sidebars, the warehouses tab rows.                                                                            | Render in a component harness with a fresh store; assert rendered output, interaction and assistive-technology conveyance. No full app boot.                |
| Contract          | **N/A.** `sad.md` §7 records no endpoint, request/response shape, status code, cache tag or shared-schema change; the two consumed reads and the entry-write endpoint are untouched. | There is no boundary to re-agree, so no contract test is written.                                                                                           |
| E2E               | **N/A.** No cross-container runner exists and this change request introduces none.                                                                                                   | The full flow is exercised in process at the integration level instead.                                                                                     |
| Load              | **N/A.** Neither numeric target in `spec.md` §6 is load-testable here.                                                                                                               | See "NFR validation" — one target is unchanged and server-owned, the other is explicitly a manual ceiling.                                                  |
| Visual-regression | **N/A.** No baseline tooling exists in the repository.                                                                                                                               | The 390px switcher fit stays the manual gate `spec.md` §6 defines it as.                                                                                    |
| E2E-through-UI    | **N/A.** Decided at `plan-tests` (2026-08-13) — no browser driver is introduced.                                                                                                     | Route integration through the real router covers every flow `sad.md` §6 draws.                                                                              |

## AC coverage

Every acceptance criterion below has at least one test. Each error and authorization criterion has
its own dedicated rows, never folded into a happy path.

| AC (spec.md §5) | Test name (intent-based)                                                                                 | Level                   | Expected outcome                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CR-AC-01        | switcher presents one workspace row above the nested warehouse group                                     | component               | The Workspace row shows the Workspace name, or the unnamed placeholder, and every Warehouse the actor holds a membership in is listed beneath it by name.                                                        |
| CR-AC-01        | the current context row is marked by something other than colour                                         | component               | The entered row carries a non-colour current marker; no row is marked current when no context is entered.                                                                                                        |
| CR-AC-02        | choosing the workspace row enters the workspace view                                                     | component + integration | The app moves to the Workspace view, the switcher closes, and that row is marked current.                                                                                                                        |
| CR-AC-02        | choosing a warehouse row enters that warehouse view                                                      | component + integration | The app moves to that Warehouse's view, the switcher closes, and that row is marked current.                                                                                                                     |
| CR-AC-02        | entering a context never asks for proof of identity                                                      | integration             | No credential, password or identity prompt appears at any point; the existing session continues through the switch.                                                                                              |
| CR-AC-03        | workspace row is inert for an actor without administration authority                                     | component               | The row shows the Workspace name, is not a link, cannot be activated by pointer or keyboard, is conveyed as disabled to assistive technology, and carries the short no-access explanation.                       |
| CR-AC-03        | warehouse rows stay selectable beneath the inert workspace row                                           | component               | The actor's Warehouses remain listed and selectable.                                                                                                                                                             |
| CR-AC-03        | the inert row is identical for a non-member and for a member holding only non-administration permissions | component               | Both actors are shown the same inert row, because the Workspace destination is unreachable for both.                                                                                                             |
| CR-AC-04        | no navigation entry outside the two named exceptions is shown unusable                                   | component               | Every entry whose capabilities are all unavailable is omitted entirely; only the inert Workspace row and archived Warehouse rows remain visible-but-unselectable.                                                |
| CR-AC-05        | two addresses in one session keep their own warehouses                                                   | integration             | The address opened for the first Warehouse keeps showing it while another moves to the second; neither re-points the other.                                                                                      |
| CR-AC-06        | the access surface reads the warehouse named in the address                                              | integration             | Each view shows that named Warehouse's own Roles, Permission catalogue and members.                                                                                                                              |
| CR-AC-06        | controls are gated by the role held in the addressed warehouse alone                                     | integration             | A capability held in one Warehouse and absent in the other gates each view independently.                                                                                                                        |
| CR-AC-06        | the entered-warehouse reader answers only for an entered verdict                                         | unit                    | The identifier is returned inside a Warehouse view and nothing outside one; no access projection is requested outside a Warehouse view, and the addressed Warehouse is requested inside one.                     |
| CR-AC-06        | changing the stored selection changes nothing about an open address                                      | integration             | The open view continues to show the Warehouse its address names.                                                                                                                                                 |
| CR-AC-07        | entry verdict refuses a warehouse the actor holds no membership in                                       | unit                    | The non-member refusal verdict is returned and no redirect is ever thrown.                                                                                                                                       |
| CR-AC-07        | the four non-member cases produce one identical refusal                                                  | unit + integration      | A non-existent Warehouse, one in another Workspace, one in the actor's own Workspace without a membership, and a malformed identifier all produce the same refusal, disclosing nothing that separates them.      |
| CR-AC-07        | a malformed warehouse identifier is not shape-checked ahead of the membership check                      | unit                    | It is refused identically to a well-formed identifier the actor holds no membership in, offering no signal that separates the two.                                                                               |
| CR-AC-07        | a refused actor stays at the address they requested                                                      | integration             | No redirect occurs, the landing resolver does not run, and no other context is entered on their behalf.                                                                                                          |
| CR-AC-07        | an address beneath a refused warehouse is refused the same way                                           | integration             | Including one naming no destination this application offers; the unmatched-address handling is never reached.                                                                                                    |
| CR-AC-07        | a refusal requests no access projection and writes no stored selection                                   | integration             | No projection request is issued and the stored selection is left unchanged.                                                                                                                                      |
| CR-AC-07        | a refusal renders in the no-context shell with no navigation list                                        | integration             | The grouped switcher is offered as the way out; the Warehouse-view sidebar is never rendered around a refusal.                                                                                                   |
| CR-AC-08        | landing rules are evaluated in order and the first match decides                                         | unit                    | Administration authority resolves to the Workspace view; otherwise a non-null effective Warehouse resolves to that Warehouse view; otherwise the actor remains at the root.                                      |
| CR-AC-08        | rule one fires for any single administration permission                                                  | unit                    | Holding any one of the four administration Permissions resolves to the Workspace view.                                                                                                                           |
| CR-AC-08        | rule two consumes the server's derivation unchanged                                                      | unit                    | The derived effective Warehouse is used as given; no membership-picking logic runs on the web.                                                                                                                   |
| CR-AC-08        | no rule is evaluated while the workspace context read is unresolved                                      | integration             | The actor remains at the root in a pending state, exactly one navigation follows, and no context is shown and then withdrawn.                                                                                    |
| CR-AC-08        | a failed workspace context read renders the standard error state with a retry                            | integration             | The route error state with a working retry is rendered, not the no-context state.                                                                                                                                |
| CR-AC-09        | the entry write fires only when the entered warehouse differs from the derived value                     | unit                    | The write is issued on a genuine change of context and compares against the derived effective Warehouse, never a raw record.                                                                                     |
| CR-AC-09        | re-entering or refreshing the same warehouse writes nothing                                              | unit                    | No write is issued.                                                                                                                                                                                              |
| CR-AC-09        | a failed entry write leaves the actor working in the warehouse                                           | unit + integration      | The actor stays with exactly the capabilities their membership carries, no alert is raised over an otherwise working view, and the only consequence is the next landing resolving from the unchanged derivation. |
| CR-AC-09        | the entry write is issued after the warehouse view is entered and never blocks it                        | integration             | The view renders first; no route or gate awaits the write.                                                                                                                                                       |
| CR-AC-09        | the stored selection marks no switcher row and gates no screen                                           | integration             | Current-row marking and every capability gate come from the address and the actor's Role; the stored value is never an input to an authorization decision.                                                       |
| CR-AC-10        | a registrant arrives in their new workspace                                                              | integration             | The Workspace view is entered by rule one, and the switcher offers their first Warehouse beneath the Workspace row.                                                                                              |
| CR-AC-11        | the warehouse sidebar lists dashboard and access addressed within the entered warehouse                  | component               | Both entries resolve within the entered Warehouse.                                                                                                                                                               |
| CR-AC-11        | the access entry appears only for a watch capability held in the entered warehouse                       | component               | The unchanged predicate is evaluated against that Warehouse's own projection.                                                                                                                                    |
| CR-AC-11        | no workspace destination appears in the warehouse sidebar                                                | component               | The Workspace administration destination is absent.                                                                                                                                                              |
| CR-AC-12        | the workspace sidebar lists the administration destination only                                          | component               | No Warehouse-scoped destination is present, and none is reachable other than by entering a Warehouse.                                                                                                            |
| CR-AC-13        | enter renders only on non-archived rows in the actor's own membership list                               | component               | The membership list is read from the same Workspace context source the switcher reads, so the two controls cannot disagree.                                                                                      |
| CR-AC-13        | every other row renders no enter control at all                                                          | component               | The control is hidden rather than disabled on rows the actor holds no membership in and on archived rows.                                                                                                        |
| CR-AC-13        | workspace administration actions are unchanged on every row                                              | component               | Rename, archive and restore, and grant and withdraw access still render exactly as today.                                                                                                                        |
| CR-AC-14        | activating enter arrives in that warehouse                                                               | integration             | The row's Warehouse view is entered, that row is marked current in the switcher, and the entry is written as the stored selection.                                                                               |
| CR-AC-14        | capabilities inside the entered warehouse come from the membership role alone                            | integration             | No Workspace Permission grants anything inside the Warehouse.                                                                                                                                                    |
| CR-AC-15        | every canonical document row is reconciled with a backlink                                               | integration             | All seven rows of `change.md` §8 are present in their named documents, each carrying a backlink to this change request.                                                                                          |
| CR-AC-16        | an unmatched address lands at the root and resolves                                                      | integration             | Including a bookmarked address for the removed access route; the actor's context is then resolved by the landing rules.                                                                                          |
| CR-AC-16        | an unauthenticated actor opening an unmatched address reaches sign-in                                    | integration             | The existing auth guard behaves exactly as today.                                                                                                                                                                |
| CR-AC-16        | unmatched handling performs no warehouse resolution of its own                                           | integration             | No address is matched to any particular Warehouse; an address naming a Warehouse the actor may not enter never reaches this handling.                                                                            |
| CR-AC-17        | entry verdict is the archived refusal for an archived membership                                         | unit                    | The archived reason is returned, distinct from the non-member reason.                                                                                                                                            |
| CR-AC-17        | an archived warehouse address is refused with the archived explanation                                   | integration             | An explicit refusal naming the archived state, the stored selection unchanged, and memberships in other Warehouses unaffected.                                                                                   |
| CR-AC-17        | the archived reason is named to a member holding no watch capability over it                             | integration             | The archived state is named and nothing further — no Role, member or record is disclosed.                                                                                                                        |
| CR-AC-18        | the root renders the no-context shell                                                                    | integration             | The grouped switcher with its inert Workspace row and the actor's Warehouses, the retained explanation of why nothing is entered, and a sidebar rendering no navigation list rather than an empty one.           |
| CR-AC-18        | choosing a selectable warehouse row is the only action offered                                           | integration             | That row enters its Warehouse; nothing else is actionable.                                                                                                                                                       |
| CR-AC-18        | an actor with no selectable row is offered no action                                                     | component               | The grouped control still renders with its inert Workspace row and dimmed archived rows, the retained message is the whole of what the root offers, and no empty affordance stands in place of an action.        |
| CR-AC-19        | the access entry is absent while the entered warehouse's projection is unresolved                        | component               | It appears once the projection arrives, following the shipped predicate's falsy behavior verbatim.                                                                                                               |
| CR-AC-19        | no held-over value from the previous warehouse is shown during a switch                                  | component               | No skeleton, placeholder, or previous-Warehouse answer is rendered while the new projection is unresolved.                                                                                                       |
| CR-AC-20        | archiving the warehouse does not evict the actor from it                                                 | integration             | The address keeps naming it and nothing moves the actor out on its own.                                                                                                                                          |
| CR-AC-20        | withdrawing the membership does not evict the actor                                                      | integration             | The address keeps naming it and nothing moves the actor out on its own.                                                                                                                                          |
| CR-AC-20        | refetching the workspace context while inside a warehouse leaves the actor in place                      | integration             | The entry verdict is computed at entry and not recomputed from the cache — the load-bearing consequence recorded in ADR 0001.                                                                                    |
| CR-AC-20        | the switcher reflects the change on its next reading                                                     | integration             | The effective Warehouse ceases to name it, the retained message explains it, the stored selection is not rewritten, and other memberships are unaffected.                                                        |
| CR-AC-20        | each act inside an archived or withdrawn context is decided when it is authorized                        | integration             | Reads of retained records continue and are marked archived while changes are refused with the archived explanation; after withdrawal every act is refused without disclosing contents.                           |
| CR-AC-21        | a member without the surface's capability is admitted and finds it unpopulated                           | integration             | Not refused at the address and not redirected; the actor arrives inside the Warehouse and the access surface reports the information is unavailable to them, exactly as today.                                   |

### Regression boundaries (spec.md §5.1)

| Boundary | Test name (intent-based)                                                            | Level       | Expected outcome                                                                                                                                                                                                                                                                           |
| -------- | ----------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CR-RG-01 | server authorization rules are re-read per request and unchanged                    | integration | The existing server authorization suites run unmodified and stay green; a request that does not unambiguously name exactly one Warehouse is still refused rather than resolved to any default.                                                                                             |
| CR-RG-01 | client-side visibility remains advisory only                                        | integration | Hiding or showing a control changes nothing about what the server permits.                                                                                                                                                                                                                 |
| CR-RG-02 | archived rows stay listed, dimmed, labelled and unselectable                        | component   | In both the switcher and the warehouses tab, exactly as today.                                                                                                                                                                                                                             |
| CR-RG-02 | an archived warehouse is enterable by no path                                       | integration | Neither a switcher row, nor an Enter action, nor a direct address enters it.                                                                                                                                                                                                               |
| CR-RG-03 | each of the three retained messages renders beside the grouped control              | component   | Existing copy and intent preserved; the Workspace row and any selectable Warehouses stay reachable while a message is shown.                                                                                                                                                               |
| CR-RG-03 | the retained messages do not render beside a row marked current                     | component   | They render only when no Warehouse context is entered, so a failed entry write cannot produce "nothing chosen" beside a current row.                                                                                                                                                       |
| CR-RG-04 | several live memberships with no valid stored selection reaches the no-context rule | unit        | No Warehouse is entered on the actor's behalf; the web adds no membership-selection logic of its own.                                                                                                                                                                                      |
| CR-RG-05 | the workspace route guard refuses and redirects as today                            | integration | Evaluated against the identical administration Permission set; the inert switcher row changes what is displayed, never what is reachable.                                                                                                                                                  |
| CR-RG-05 | no actor is redirected more than once between the root and the workspace view       | integration | Exactly one navigation resolves the landing, and no actor is sent into a destination the guard bounces them out of.                                                                                                                                                                        |
| CR-RG-06 | shell chrome renders and behaves as today                                           | component   | Brand, language selector, sign-out control, narrow-viewport drawer toggle with its focus trap and focus return, footer, the persistent sidebar container at and above the small breakpoint, the off-canvas drawer below it, and the auth-route and chrome-less branches are all unchanged. |

### Removed behavior — proof it is no longer reachable

| Removed behavior                                        | Test name (intent-based)                                                             | Level       | Expected outcome                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| The workspace-wide access address (CH-03)               | the previous access address no longer resolves                                       | integration | It reaches the unmatched handling and resolves through the root, with no per-address shim.                                |
| The root as a dashboard (CH-03)                         | the root no longer renders a dashboard                                               | integration | The root resolves a context or renders the no-context state; the dashboard content is reachable only inside a Warehouse.  |
| Implicit warehouse resolution on the web (CH-04, CH-05) | the effective-warehouse value is referenced only at the three allowlisted call sites | integration | An automated architecture check over the non-test sources of the web application fails on any fourth reference.           |
| Implicit warehouse resolution on the web (CH-04)        | no warehouse-scoped screen resolves its warehouse from the stored selection          | integration | Every Warehouse-scoped screen takes its Warehouse from the address.                                                       |
| The entry write's failure alert (CH-05)                 | the entry-write endpoint no longer raises the shared failure alert                   | unit        | Its failure is allowlisted at the failure-normalization boundary; every other failure path still raises exactly as today. |

### Locale parity (spec.md §6)

| Requirement         | Test name (intent-based)                        | Level       | Expected outcome                                                                                                                    |
| ------------------- | ----------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Locale completeness | both locale directories hold identical key sets | integration | After the additions to the two existing namespaces, the two locale directories have identical key sets and no new namespace exists. |

## Edge cases / error paths

Each of these has its own dedicated row above; they are collected here as the boundary and failure
set the specification implies.

- Warehouse identifier naming a Warehouse that does not exist → expected: the non-disclosing refusal,
  rendered at the requested address.
- Warehouse identifier naming a Warehouse in another Workspace → expected: the same non-disclosing
  refusal, indistinguishable from the case above.
- Warehouse identifier naming a Warehouse in the actor's own Workspace without a membership for them
  → expected: the same non-disclosing refusal, even when the actor holds Workspace Permissions
  covering that Warehouse record.
- Malformed Warehouse identifier → expected: the same non-disclosing refusal; the value is not
  shape-checked before the membership lookup, so nothing separates a malformed guess from a valid one.
- An address beneath any of the four cases above, including one naming no destination the application
  offers → expected: the same refusal; the unmatched-address handling is never reached.
- Archived Warehouse the actor holds a membership in, opened by address → expected: the explicit
  archived refusal, named to every member of it and disclosing nothing further.
- The Workspace context read is unresolved → expected: the actor remains at the root in a pending
  state and no landing rule is evaluated.
- The Workspace context read fails → expected: the standard route error state with a retry, and
  explicitly not the no-context state, because a failed read means access is unknown, not absent.
- The entry write fails → expected: the actor stays in the Warehouse with unchanged capabilities, no
  alert is raised, and the next landing resolves from the unchanged derivation.
- The access projection for the newly entered Warehouse is unresolved → expected: the Access entry is
  absent, with no placeholder and no held-over answer from the previous Warehouse.
- The Warehouse is archived, or the membership withdrawn, while the actor is inside it → expected: no
  eviction; each subsequent act is decided when it is authorized.
- An actor holds several live memberships and no valid stored selection → expected: the no-context
  state; nothing chooses a Warehouse for them.
- An actor holds memberships only in archived Warehouses, or none at all → expected: the no-context
  state with no action offered and no empty affordance in place of one.
- An address is unmatched and names no Warehouse → expected: it lands at the root and resolves there.

## Test data

- **Seed strategy:** the existing shared fixtures under the web application's cross-cutting test
  setup — the Workspace context fixture (memberships, archived flags, Workspace Permissions, the
  derived effective Warehouse) and the access fixture (Role, Permission identifiers, archived
  timestamp) — extended with the cases this change adds: an actor with several live memberships and
  no valid stored selection, an actor whose only memberships are archived, a Workspace Member holding
  only non-administration Permissions, and a member of a Warehouse whose Role carries no watch
  Permission. There is no data model and no migration for this change request (`sad.md` §7), so no
  entity shape is introduced.
- **Integration dependency:** the real router, the real store with real reducers, and the real
  components are all exercised — nothing internal to the web application is mocked. The one boundary
  answered by the suite is the out-of-process server, which this change does not own and does not
  alter: `sad.md` §7 records zero contract changes, so its responses are shaped by the unchanged
  shared contract types and cannot drift from the real ones. The server's own authorization behavior
  is verified where it lives, by the existing server suites against their real ephemeral database,
  running unmodified (CR-RG-01).
- **Cleanup boundary:** per test — a fresh store and a fresh memory-history router for every case, so
  no cached access projection, entered verdict, or recorded entry leaks between tests. This matters
  more than usual here: CR-AC-05, CR-AC-06 and CR-AC-19 are all about state not crossing between
  Warehouses, and a shared cache would let a suite pass for the wrong reason.
- **Repository-document check (CR-AC-15):** reads the real documents in the working tree, following
  the existing release-gate precedent under `tests/`; it adds no fixture and asserts presence and
  backlinks only.

## NFR validation (load)

<!-- N/A: no numeric NFR to load-test. -->

`spec.md` §6 carries two numbers, and neither is a load target:

- **Authorization stage p95 ≤ 50 ms per protected Warehouse operation** — recorded as _unchanged_.
  The Warehouse under authorization arrives from the address instead of the effective selection and
  no additional lookup enters the authorization path, so this change introduces no new load scenario;
  the existing Workspace load gate continues to own that target.
- **Warehouse entry ≤ 250 ms** — deliberately restated in `spec.md` §6 as a ceiling rather than a
  percentile, "because the repository adds no telemetry and no percentile can be drawn from a manual
  run". It is a manual gate, not a load scenario, and inventing a synthetic rate for it would report
  a number the specification says cannot be drawn.

**Manual gates at `ship`** (from `spec.md` §6, tracked by the
`responsive-and-entry-latency-verification` task):

- Entry latency — five consecutive runs, each started on activating a switcher row or an Enter action
  and stopped when the Warehouse view is rendered with its own access projection resolved; every run
  ≤ 250 ms.
- Switcher fit — at a 390px viewport, the grouped switcher with its Workspace row and nested
  Warehouse group sits in the context bar without horizontal overflow, and its popover does not
  overflow the viewport.

## CI placement

- **On every pull request:** unit, component and integration, plus the automated architecture check
  over the non-test web sources and the locale key-set parity check. All of them run in process and
  are fast; the architecture check is the enforcement mechanism for `spec.md` §6's zero-fourth-reference
  target, so it must gate every change, not a nightly run.
- **On every pull request, unchanged:** the existing server authorization suites, which carry
  CR-RG-01 and the server half of CR-AC-20 and must stay green without modification.
- **At `ship`:** the CR-AC-15 repository-document check, run after review PASS as part of the
  canonical reconciliation step, and the two manual gates above.
