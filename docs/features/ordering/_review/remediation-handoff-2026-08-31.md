# Ordering remediation — session handoff (2026-08-31)

Status: **implementation complete and green; both halves independently verified and every
actionable finding fixed.** Updated after a third working session. The only substantive check that
has never run is the browser walkthrough — see §6.
Branch `22-ordering`, on top of `d4557e7`. Nothing is committed — 147 files modified, 67 new.

This records what was changed, what is verified, what is not, and what to do next. It is the
resume point for the remediation of `_review/ordering-gap-report` (the audit that found the
backend essentially complete and the web rendering ~45% of the approved design).

## 1. Gate state at the moment work stopped

| package                 | tests                               | lint  | typecheck / build |
| ----------------------- | ----------------------------------- | ----- | ----------------- |
| `@warehouser/web`       | 145 files / **1207** passing        | clean | build ✓           |
| `@warehouser/server`    | **1125** unit + **577** integration | clean | clean             |
| `@warehouser/contracts` | **129**                             | clean | build ✓           |

All run from the repo root with `pnpm --filter <pkg> <script>`. Baseline before the work was
959 web tests; there was **no** pre-existing failing suite, contrary to what the earlier audit
assumed.

## 2. Before this runs locally

1. `pnpm --filter @warehouser/server migration:run` — a new migration adds the
   `purchase_drafts.reference` column. The running code requires it. **Run it with the app
   stopped**: a concurrent INSERT during the backfill leaves a NULL `reference` and aborts at
   `SET NOT NULL`. It fails safe, but it fails.
2. Restart the dev server on `:3100`; it is still serving pre-change code.
3. `pnpm --filter @warehouser/contracts build` if the web build behaves oddly — web and server
   resolve contracts through `dist`.

## 3. What was fixed, against the audit's ten findings

| #   | Finding                                                      | Where it was fixed                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `expectedArrivalDate` blanked the whole Purchase Drafts list | `shared/domain/repositories/purchase-draft-read.repository.ts` — both raw read paths now select `(draft.expectedArrivalDate)::text`. The parentheses are load-bearing: TypeORM only rewrites `alias.property` when terminated by `=`, `)` or `,`. Verified red-then-green. A second latent instance was fixed in `purchase-draft-freeze.repository.ts` (`(order.neededBy)::text`). |
| 02  | No way to link a draft line to a customer order              | New `modules/purchase-draft/components/purchase-draft-line-links/` — the `SERVES` section, link rows, `+ Link a customer order`, intended-quantity, remove, and the links-note totals. `useAddPurchaseDraftLineLinkMutation` now has real call sites.                                                                                                                              |
| 03  | Expected Arrival Date unsettable                             | New `ExpectedArrivalDateField.tsx` on `useRevisePurchaseDraftMutation`; clearable to null, disabled when frozen or archived.                                                                                                                                                                                                                                                       |
| 04  | Archived warehouse lost reads it must keep (AC-23)           | `guards/warehouse-entry.guard.ts` gained an `entered-read-only` verdict; the three ordering loaders now read under it; `useArchivedWarehouse()` + `ArchivedWarehouseNotice`/`Chip` render controls visible-and-disabled. **See §5 — this contradicts an accepted change request.**                                                                                                 |
| 05  | Every refusal read "Nothing has changed."                    | Server: `shared/errors/validation-field-codes.ts` emits `details.fields`. Web: `transformErrorResponse` on the item, demand and draft endpoints, and `translateValidation` on every dialog.                                                                                                                                                                                        |
| 06  | Six draft-mutation routes unscoped to the warehouse          | `warehouse_id` moved into each guarded conditional write's own `WHERE`, behind a `PurchaseDraftWriteScope` value so no call site can omit it. A foreign draft is refused identically to a missing one.                                                                                                                                                                             |
| 07  | No draft was identifiable                                    | Migration `1786600200000-AddPurchaseDraftReference.ts`; `reference` required on both projections; `PD-0143` renders on cards, the detail header and every dialog title.                                                                                                                                                                                                            |
| 08  | Drift said something moved, never what                       | `utils/link-drift.ts` + `useDriftBullets` / `useLinkDriftChips` reconstruct the comparison from the snapshot and current values already on the wire.                                                                                                                                                                                                                               |
| 09  | Deactivated item still addable to a draft line               | `purchase-draft-assembly.predicates.ts` `isSelectableItem`, asserted in `purchase-draft-assembly.service.ts`, covering create / add-line / restated revise-line.                                                                                                                                                                                                                   |
| 10  | Design content stripped from every surface                   | Search fields, urgency/overdue chips, on-hand reason lines, naming lines, mobile labels, empty states with CTAs, route-level skeletons, table footers, info notes, sidebar drift badge, dialog titles naming their subject, per-field helper text, and `useLocaleFormat()` everywhere.                                                                                             |

Supporting contract work: `demandCoverageSchema.purchaseDraftReference`,
`itemSchema.namingCustomerOrderCount` / `namingPurchaseDraftLineCount`,
`itemLatestAdjustmentSchema.adjustedByUserId`, plus `openapi.yaml` for all of it.

## 4. Verification status — READ THIS FIRST ON RESUME

### 4.1 Server + contracts — VERIFIED, findings fixed

An independent read-only pass checked every server claim empirically (it ran the migration through
PGlite, benchmarked the reducer, and read TypeORM's own source rather than trusting the comments).
It reported **70% confidence** and eleven findings. All the actionable ones are now fixed and the
gates are green:

- **CRITICAL, and nobody had caught it: the `details.fields` reducer was a remote event-loop DoS.**
  `collectFields` spread its accumulator inside a `reduce`, so it was quadratic — 20 000 issues took
  **42 s of synchronous, event-loop-blocking time**, reachable from one 100 KB request because the
  draft-line arrays had no `.max()` and `main.ts` set no body-parser limit. NestJS runs guards
  _before_ pipes, so the rate-limit guard could not stop the first one. Fixed at all three layers:
  the reducer mutates a `Map` (42 s → **9 ms**), a 50-field cap that provably cannot change which
  code a field gets, `.max()` on every unbounded request array in `packages/contracts` (two outside
  ordering, in `access-mutations.ts` and `workspaces-mutations.ts`), and a 128 KB body limit.
- **`freeze` and `close` were still keyed only on a resource id**, relying on the pre-read their own
  sibling's comment declared insufficient. `warehouse_id` moved into both writes' own `WHERE` behind
  a `PurchaseDraftTransitionScope`; the pre-reads stay, but only to choose _which_ refusal is owed.
- **`POST .../lines/{lineId}/links` returned 500 where `openapi.yaml` promises 404** — the line was
  never checked to belong to the draft, so the composite FK raised. Fixed and tested.
- The "may this Item be newly named" rule existed twice; extracted to
  `shared/predicates/item-availability.predicates.ts`.
- `isNamedByDemandOrDraft` had lost its `EXISTS` short-circuit to the count-sharing. Both are now
  achievable: the shared piece is the _definition_ of "names this Item", parameterized by its select
  expression, so enforcement uses `EXISTS` and the list read uses `COUNT`.
- **The headline claim of the whole scoping change is now guarded.** A new route-level integration
  test hits ten routes twice — foreign ids and random ids — and asserts each pair identical on
  status _and_ full body, then re-reads the victim draft to prove nothing reached it.

Verified clean and needing nothing: the deactivated-Item guard matches AC-06d in both halves; the
naming counts really are inseparable from the SKU enforcement; `openapi.yaml` matches on every
touched route; no test was weakened; `details.fields` cannot leak user input today; and the
load-bearing-parentheses claim about TypeORM's alias rewriting is true, not folklore.

Still open on the server, by choice rather than oversight — see §5:
the global reference sequence is a cross-tenant side channel, and the migration locks the table for
its whole run and does not preserve references across a `down`/`up`.

### 4.2 Web — VERIFIED, findings fixed

An independent read-only pass reported **70% confidence** and fourteen findings. All are now fixed
and the gates are green. The serious ones:

- **CRITICAL — a real authorization hole in the UI.** Every write control on the Purchase Draft
  detail (the arrival-date field, a line's Item/Quantity/Packaging/Note, the remove-line trash, the
  intended-quantity field, the unlink `×`) carried **no permission gate at all** — the module gated
  only its five _trigger_ buttons. An actor holding `PURCHASE_DRAFTS:WATCH` alone saw a fully
  editable draft with a live delete control, and every edit 403'd into a generic toast. AC-22's
  letter names only CREATE/READY/RECEIVE so the criterion passed; the declarative-permission-gates
  ADR does not exempt UPDATE. Fixed under one rule: a control that also _shows what the draft says_
  stays visible and disabled with its reason stated; a control that only writes is withheld by
  `WarehousePermissionGate`.
- **Purchase-draft writes never invalidated `Demand` or `Items`.** All twelve mutations invalidated
  `PurchaseDrafts` only, so linking an order left the Covered-by chips stale, confirming an arrival
  left the fulfilled customer on Demand, and adding a line left "Named by … 1 draft line" stale on
  Items. The tag set is now derived per mutation from what the server actually aggregates, not
  blanket-invalidated.
- **The arrival dialog let a member assign to a _cancelled_ link** the server must refuse; it was
  also the one place ungrouped numbers still rendered (`1180 arrived`); and **AC-18's "That
  assignment cannot be recorded" was never built**. All three fixed — and the server turned out to
  already publish the per-bound breakdown (`demand-allocation.errors.ts:34-39`), so every bound is
  now named.
- **Clearing the expected arrival date had no control that rendered.** Two locale keys for it
  existed and were referenced nowhere, so that half of AC-10 was undiscoverable and untested.
- **The add-a-line workflow had zero tests in the entire suite** — the exact defect class the
  original audit was about — and one existing test clicked unlink then asserted something unrelated,
  passing identically if the handler were a no-op.
- Plus: an element ternary that showed "Select a purchase draft" to a member who had just selected
  one; a line whose Item was deactivated afterwards rendering a **blank** Item field; a dialog with
  no `onRefusal` that failed silently; the desktop demand disclosure having lost its visible count;
  generic success toasts where the design requires the committed outcome; and row renderers closing
  over live state contrary to the `Table` ADR.

Two things the fixing agents found beyond their briefs, both real: **`uk/customer-order.json`'s
plural forms were wrong**, not merely untidy — for Ukrainian `count=3` and `count=5` i18next fell
back to the bare singular, rendering "через 3 день" and "5 товар". And `mutationFeedbackMiddleware`
passes only `meta.arg.originalArgs` to the toast registry, never the response — so a toast can state
only what rides along in the _request_, which is why the committed-outcome copy takes that shape.

Verified clean and needing nothing: **zero `if`/`else if` chains or ternary ladders** across the
whole diff (the one element ternary above was the sole exception and is gone); `Conditional` used
correctly everywhere; no dangling `aria-describedby`; every `translateValidation` total over the
five codes; and **no test weakened, skipped or deleted** — every removed assertion is a genuine
replacement for behaviour that deliberately changed.

### 4.4 Closed afterwards: the dated drift copy

The frames date every drift statement (`Cancelled on 24 Aug`, `Raised to 1 000 on 25 Aug`) and
nothing on the wire carried when the linked order moved — two agents hit that wall independently.
Now closed end to end: `linkedCustomerOrderStateSchema.lastChangedAt` and the violation's
`customerOrderLastChangedAt`, both **required keys with nullable values**, sourced from
`customer_orders.updated_at` and emitted as `NULL` unless `updated_at > created_at`, so an order that
never moved is never dated. The dated wording is selected through i18next's `context` suffix rather
than a branch between two `t()` calls.

### 4.3 Completed earlier: archived read-only audit — all five defects fixed

D1–D5 are closed. Two are worth knowing about because the fixes went further than the findings:

- The audit's diagnosis of D2 was wrong in a useful way. It concluded a per-item `aria-describedby`
  would need a cast because RAC's `MenuItemProps` does not extend `AriaLabelingProps` — but
  **TypeScript exempts hyphenated JSX attribute names from excess-property checking**, so it
  compiles with no cast at all. Per-item is now used everywhere, and it is strictly better: a
  disabled `Dropdown.Item` carries `aria-disabled` and stays focusable, so the reason is announced
  every time it is reached, where a container description is announced once on open.
- D4 was fixed by making divergence _unrepresentable_ rather than merely correcting it. A control
  now points at the Line's own single refusal sentence, so the announced text and the drawn text are
  the same string, whichever reason `write-refusal.ts` ranks first.

One design-level tension was assessed and deliberately left: HeroUI's `Button` with `isDisabled`
emits the **native** `disabled` attribute, so those controls leave the tab order and a screen-reader
user meets the reason only in browse mode. The reason is still discoverable without reaching any
control (the destination notice, and beside the fields on a draft Line). The clean fix — `aria-disabled`
plus a swallowed press in the shared `Button` wrapper — has app-wide blast radius and belongs to the
shared-components owner.

## 5. Decisions the user must arbitrate

1. **AC-23 vs CR-AC-17 — an accepted spec was overridden.**
   `docs/change-requests/workspace-warehouse/spec.md:542-550` closed this exact question at
   `clarify` on 2026-08-13 with _"No — archived Warehouses stay non-enterable (CR-RG-02)"_.
   Ordering's AC-23, accepted later, requires the opposite. The resolution taken: AC-23 wins
   narrowly — entry is read-only, the archived reason is still named explicitly, and the **Access
   destination alone** still refuses outright (so CR-AC-13 holds and the sidebar hides its Access
   link). **No spec text was edited.** `CR-RG-02`'s "not enterable by any path" is now factually
   wrong and needs correcting, and `ordering` §8's open question about `workspaces` AC-12a can be
   closed as "exposed by `ordering`".

2. **The draft reference sequence is global, and that makes it a cross-tenant side channel.**
   `PD-0143` and `PD-0144` can belong to different warehouses, and a single warehouse's references
   have gaps. Worse than cosmetic: the sequence is monotonic across every workspace in the
   deployment and the reference is rendered on every card, header and dialog title, so any member
   can read the deployment-wide total number of drafts ever created, and by creating two drafts a
   known interval apart can measure other tenants' creation rates. `spec.md:420` and the
   confidential classification at `:396` make this a disclosure decision, not a numbering one.
   Per-warehouse numbering would need a serialized read of that warehouse's last reference on every
   insert — the cost that motivated the global sequence in the first place.

2a. **The migration does not preserve references across a `down` then `up`.** Re-running `up`
renumbers by `created_at` rank, so a draft previously `PD-0006` need not be `PD-0006` again. The
reference is quoted to suppliers by design, so a rollback-and-reapply is not identity-preserving.
It also rewrites the whole table and takes `ACCESS EXCLUSIVE` for the duration — fine now,
worth timing against production-shaped data before it runs there.

3. **Two refusals changed HTTP status.** Adding a line or link to a missing _or foreign_ draft, and
   discarding a missing draft, now return **404 `purchase_drafts.target_unavailable`** where they
   previously returned 409. Deliberate: it stops the route disclosing that a draft exists elsewhere.

4. **This system models no person name.** `users` has no name column; a member carries only an
   optional email, unreachable from any item or demand projection without a new cross-module join
   and a new disclosure decision. So the frames' "Made ready by Iryna Kovalenko" renders as "you"
   for the acting user and a neutral fallback otherwise. A real gap between design and domain.

## 6. Known gaps deliberately left open

- ~~**AC-19b's floor value.**~~ **Closed.** `ApiFailure` and `MutationOutcome` now carry the
  refusal's `details` envelope, and `translateValidation` takes it as an optional third argument —
  which was the load-bearing part, because `translateValidation` runs _before_ `onRefusal`, so the
  figure could never have reached a field message through component state. The message now reads
  "This order cannot go below 1 600.".
- **Frozen-draft specifics on Amend/Cancel.** "2 frozen drafts link to this order" needs links from
  the draft _summary_ projection; they exist only on the detail, so it would be one request per
  draft. Renders generically instead. Needs a server projection.
- **The "on 25 Aug" date inside a drift sentence.** `purchaseDraftLineLinkSchema` carries no
  timestamp for _when_ the linked order moved. Needs `changedAt` on
  `linkedCustomerOrderStateSchema`.
- **`FormModalDialog` calls `onRefusal` unconditionally** after applying field errors, so a refusal
  that _does_ name fields shows both the field message and a generic alert. Demand and Items each
  worked around it locally; the clean fix is in the shared component. Still open.
- **A schema-legal maximal draft body exceeds the new 128 KB limit** (200 lines × 50 links). That is
  deliberate — the tighter guard wins and 128 KB is far above any hand-assembled draft — but if a
  bulk-import path is ever added, the byte ceiling is the one to raise first.
- **`ItemPicker` option caption.** The label now reads `WH-100420 · Pallet wrap, 500mm` as drawn,
  but the frames' secondary `60 on hand · counted in pieces` line is absent — `SelectOption` is
  `{ id, label }` and `Select.Value` would likely echo a caption into the trigger.
- **Mobile dialogs are modals, not `Drawer` sheets** as `blZtz.png` draws. `FormModalDialog`
  already reverses its footer below `md:`, which is the only interaction difference named.
- **AC-05 and AC-22 (authorization denials) remain untested** — they need a second account holding
  a restricted permission set. Carried over from the original audit.
- **No browser walkthrough has ever run — this is the largest remaining unknown.** The Chrome
  extension's content-script injection times out on every page, `example.com` included, so it is the
  browser and not the app; retried in a later session with the same result. Everything above is read
  from code, tests and design frames — never from a running screen. A walkthrough needs three things
  in order, or it will show a stale build rather than this work: the migration run **with the app
  stopped**, the server on `:3100` restarted, and a working extension.
- **A shared one-control dialog does not exist**, so AC-18's "That assignment cannot be recorded" —
  which the frame draws as its own 440px dialog with a single `Back to the form` control — ships as
  the feature-owned refusal alert `web-dialogs.md` §6 prescribes, carrying the frame's full copy,
  inside the arrival dialog that stays open.
- **`ValueAddingNoteField`** was built inside `modules/purchase-draft` because `shared/**` was out of
  that agent's scope. Promote it to `shared/components/FormTextAreaField` when a second module needs
  a multi-line field; its own doc comment says so.
- **A correction's toast cannot say which field changed** — `updateItem` sends a partial body, so the
  toast states the SKU and description the Item carries _after_ the correction, which is what
  committed, rather than which key was touched.

## 7. Working notes

- The brief every agent worked to, and the transcribed copy of all ten approved frames, are saved
  beside this file as `remediation-brief-2026-08-31.md` and `frame-notes-2026-08-31.md`. The frame
  notes are the more valuable of the two on resume: they carry the exact drawn copy, so a surface
  can be checked against the design without re-reading the PNGs. Where the notes and a frame
  disagree, the frame wins.
- `apps/web/src/test/locale-baseline.json` is regenerated, not hand-edited. There is no generator
  script; `i18n.spec.ts`'s `inBaselineCoordinates(currentSnapshot())` is what produces it.
- `apps/web/tsconfig.tsbuildinfo` and `packages/contracts/tsconfig.tsbuildinfo` show as modified;
  they are tracked build artifacts and were already tracked before this work.
- `ai/*` and `README.md` were already modified in the working tree before this work began and are
  unrelated to it.
