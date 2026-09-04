# Frontend conformance review — delivery-addresses (2026-09-04)

- **Work item:** `docs/features/delivery-addresses` (feature; `.size` = L, `.route` = full)
- **Skill:** `code-review-front-end`
- **Verdict:** `CHANGES REQUESTED`

## Diff scope

Base `a87f190e6c884ba671156bee673830e1cb0ea67a` (branch point of `11-locations` off `master`) → `HEAD`.

```
git diff a87f190e6c884ba671156bee673830e1cb0ea67a..HEAD -- apps/web packages/contracts
173 files changed, 12439 insertions(+), 939 deletions(-)
```

Paths in scope: `apps/web/**`, and `packages/contracts/**` only for how `apps/web` declares and
consumes the schema. The branch also changes `apps/server`; that side is
`/code-review-back-end delivery-addresses`, not this review.

## Document manifest

`docs/system/web-index.md` was read in full this run. Every document below was then read in full.

**Floor**

- `frontend-architecture.md`
- `architecture-map.md`
- `sad.md` (the change crosses out of `apps/web` into `packages/contracts`)
- All nine Accepted web ADRs: `27-08-2026-heroui-table-for-web-data-tables.md`,
  `27-08-2026-reducer-driven-action-dialogs.md`, `19-08-2026-declarative-permission-gates.md`,
  `19-08-2026-generated-mutation-hooks-in-components.md`,
  `18-08-2026-scope-of-exercise-placement-tiebreak.md`, `02-08-2026-rtk-query-for-web-api-calls.md`,
  `27-07-2026-bundled-centralized-web-translations.md`, `12-07-2026-schema-validation-with-zod.md`
- `adr/14-08-2026-domain-owned-flat-modules.md` — **Superseded**; read for reasoning only, never cited
  as the rule

**Selected by changed path**

- `guides/adding-a-web-module.md` (new `modules/customer`, `router.ts`, `route.tsx`, loader)
- `guides/placing-web-components.md`, `guides/writing-web-components.md`,
  `guides/writing-web-conditional-components.md`
- `guides/web-dialogs.md`, `guides/web-action-dialogs.md`
- `guides/placing-web-hooks.md`, `guides/placing-web-tests.md`
- `guides/web-error-handling.md`
- `guides/adding-and-maintaining-web-localization.md`
- `guides/heroui-design-principles.md`, `guides/heroui-react-v3-docs-index.md` (components resolved
  against `.heroui-docs/react` rather than recalled)
- `guides/adding-and-using-contracts.md`

**Selected and found not applicable**

- `guides/sharing-web-state-with-context.md` — the diff adds no `createContext` and no
  `modules/*/context/`. Cited only for its §1 prop-hop clause.

Read for context, never as the rule: `sad.md` §5–§6 and `target_surfaces`, the two Accepted feature
ADRs (`0001-observed-permission-redaction.md`, `0002-per-line-purchase-draft-endings.md`), and
`design-handoff.md`.

## Method

Five clean-context reviewers at the reasoning tier, effort `xhigh` (L-sized diff), one per dimension
group in `references/web-review-dimensions.md`, each re-reading the manifest itself. Findings below
are the merged set; where two reviewers reached the same file the corroboration is noted. Every
finding was re-verified against the code before it was recorded.

## Findings

### Blocking

- **[blocking] Customer writes leave the `Demand` and `PurchaseDrafts` caches stale** —
  `apps/web/src/modules/customer/api/customer-api.ts`:153 (`correctCustomerName`), :195
  (`correctCustomerDeliveryAddress`), :207 (`setMainCustomerDeliveryAddress`), :222/:237 (address
  de/reactivation); rule: `docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md` §Decision —
  "Mutations declare invalidation tags whenever they can make cached query results stale", restated in
  `docs/system/frontend-architecture.md` §"Redux Toolkit infrastructure"; problem: each invalidates
  only `['Customers']`, but `packages/contracts/src/customer-orders/customer-orders-projections.ts`:16
  states the customer name is "read live from the Customer record rather than copied onto the order,
  which is what makes correcting a Customer's name change every order that names it", and that field
  is served under `Demand` and `PurchaseDrafts` — so a correction leaves the Demand table and every
  open draft painting the old name/address for the life of the cache entry; the sibling
  `customer-order-api.ts`:173,184,216,226 writes in this same change already invalidate all four tags;
  suggested: add `'Demand'` and `'PurchaseDrafts'` to the name and address writes.
  _(Found independently by the state/contracts and dialogs/authorization reviewers.)_

- **[blocking] `setWarehouseDeliveryAddress` does not invalidate `PurchaseDrafts`** —
  `apps/web/src/modules/workspace/api/warehouse-api.ts`:124; rule: same ADR §Decision clause; problem:
  `packages/contracts/src/purchase-drafts/purchase-drafts-projections.ts`:80-87 makes
  `lineWarehouseDestinationSchema.frozen` explicit — an unfrozen line's `addressText` is the
  Warehouse's current address, not a captured one — and `PurchaseDraftLineDestination.tsx`:67,76
  renders it from the `PurchaseDrafts`-tagged read, so correcting the Warehouse address leaves every
  cached draft stating the previous one; suggested:
  `invalidatesTags: ['WarehouseDeliveryAddress', 'PurchaseDrafts']`.
  _(Found independently by two reviewers.)_

- **[blocking] The two line-ending mutations do not invalidate `Customers`** —
  `apps/web/src/modules/purchase-draft/api/purchase-draft-api.ts`:357, :372; rule: same ADR §Decision
  clause; problem: both invalidate `['Demand', 'PurchaseDrafts']`, but their Allocations fulfil
  Customer Orders, and `packages/contracts/src/customers/customers-projections.ts`:73-86 defines
  `customerAwaitingOrderSchema` as carrying only **Unfulfilled** orders with a positive
  `outstandingQuantity`, served under the `Customers` tag — so an open Customer detail keeps listing an
  order that is now fulfilled, or its pre-allocation outstanding quantity; suggested: add `'Customers'`
  to both.

- **[blocking] A pure helper is filed inside a `components/` tree instead of the module's `utils/`** —
  `apps/web/src/modules/customer/components/customer-directory/components/awaiting/awaiting-destination.ts`:33;
  rule: `docs/system/guides/placing-web-hooks.md` §3 "Keep non-hooks out of `hooks/`" — "Pure
  functions, lookup tables, and the types they carry go to a `utils/` directory:
  `modules/<module>/utils/` when one module owns the behaviour" — and
  `docs/system/frontend-architecture.md` §"Source structure" (`utils/  # module-owned pure helpers`);
  problem: `destinationReason` and its `REASONS` table declare no component and no hook, yet sit four
  levels inside `components/`; `modules/customer` has no `utils/` directory at all, while
  `modules/customer-order/utils/customer-order-identity.ts` and
  `modules/purchase-draft/utils/link-identity.ts` — added by this same change — are filed correctly;
  the file's own doc comment cites `placing-web-hooks.md` §4 for staying beside its consumers, but §4
  governs where a hook is _called_, not where a non-hook file is placed; suggested: move to
  `modules/customer/utils/awaiting-destination.ts`, update the single importer
  (`CustomerAwaitingDestination.tsx`:3), and restate the comment to cite §3.
  _(Found by two reviewers.)_

- **[blocking] Two stacked `Conditional`s re-test the same `view` state** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftWorkspace.tsx`:189 and :227; rule:
  `docs/system/guides/writing-web-conditional-components.md` §3 "Several mutually exclusive branches
  are a lookup, not a chain" — "stacking `Conditional`s that re-test the same state is the same chain
  written as elements"; problem: `when={view === 'byDraft'}` is followed by `when={view === 'byLine'}`,
  so one piece of state decides which of two elements renders through two guards; suggested: resolve
  above the return as a total `Record<PurchaseDraftView, ReactElement>` and render `{viewContent[view]}`,
  so a third view fails to compile.

- **[blocking] A collection's empty state is a sibling paragraph instead of `renderEmptyState`** —
  `apps/web/src/modules/purchase-draft/components/purchase-draft-line-directory/components/DockLineTable.tsx`:75,
  with the paragraph at `.../PurchaseDraftLineDirectory.tsx`:116-118; rule:
  `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` §Decision rule 3 — "**The empty
  state is `renderEmptyState` on `Table.Body`**, unless the destination renders a second responsive
  surface beside the table"; problem: `Table.Body items={entries}` carries no `renderEmptyState` and
  the copy is a `<p>` outside the table; the by-line view renders no card list for either half, so the
  ADR's exception does not apply and the message sits outside the `treegrid` an assistive technology
  walks; suggested: pass `renderEmptyState` to `Table.Body` and delete the sibling paragraph with its
  value-ternary.
  _(Found independently by the component-construction and UI reviewers.)_

- **[blocking] Four-hop callback drilling through the customer catalogue** — declared at
  `apps/web/src/modules/customer/components/customer-directory/CustomerDirectory.tsx`:90-93, passed at
  :148-150, then `.../customers/CustomerCatalogue.tsx`:107-109, `.../customers/CustomerCardList.tsx`:38-40,
  `.../customers/CustomerCard.tsx`:68-72; rule: `docs/system/guides/writing-web-components.md` §4 "Read
  data where you use it" — "**Do not pass data down more than two hops.** A value may travel parent →
  child → child"; problem: `onCorrect`/`onDeactivate` travel four hops and the three intermediates all
  carry `CustomerActionHandlers` in their prop types though none renders a control that uses them;
  `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` §Consequences accepts exactly one
  extra hop for the Demand mobile branch and names it as a deliberate exception; suggested: move
  `useActionDialog` + `ActionDialogHost` down to `CustomerCardList`, the shape
  `CustomerAddressBook.tsx`:48,102 already uses in this same feature.
  _(Found by two reviewers.)_

- **[blocking] A private sub-component with its own data access and state shares a file** —
  `apps/web/src/modules/purchase-draft/components/purchase-draft-line-delivery/components/DirectDestinationFields.tsx`:38
  (`DirectDestinationPickers`, `useCustomers()` at :45, `useState` at :50); rule:
  `docs/system/guides/writing-web-components.md` §1 "Export one component per file" — a private helper
  is kept only until "it needs a props type worth naming and exporting" or "it grows its own state,
  effects, or data access"; problem: both triggers hold; suggested: keep the exported gate wrapper here
  and move `DirectDestinationPickers` into its own file beside it.

- **[blocking] The same two-components-in-one-file shape on the demand dialog's fields** —
  `apps/web/src/modules/customer-order/components/demand-directory/components/RecordCustomerOrderCustomerFields.tsx`:52
  (`RecordCustomerOrderCustomerPickers`, `useCustomers()` at :57, `useWatch` at :58); rule: same §1
  clause; suggested: split the pickers into their own file, leaving the exported gate wrapper.

- **[blocking] A ternary chooses between an element and nothing inside a JSX prop** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftLineList.tsx`:76-83; rule:
  `docs/system/guides/writing-web-components.md` §6 "**Never branch between elements with a ternary**",
  with "Prefer rendering nothing over accepting a visibility flag"; problem:
  `endingAction={draft.state === 'ready_for_ordering' ? (<LineEndingAction … />) : undefined}` puts a
  whole-workflow branch in the caller's markup where no `Conditional` can express it; suggested: let
  `LineEndingAction` answer with an early-return guard on `draft.state` (it already receives `draft`)
  and pass it unconditionally.

- **[blocking] A `Conditional`'s `otherwise` arm reads data that exists only under the negated
  condition** — `apps/web/src/modules/purchase-draft/components/purchase-draft-transitions/components/LineEndingAction.tsx`:133-146;
  rule: `docs/system/guides/writing-web-conditional-components.md` §2 "Both arms are evaluated —
  resolve a dependent branch before the return" — "A branch whose props only exist under the condition
  therefore **cannot** be written as one"; problem: with `when={line.ending === null}`, the `otherwise`
  element is built every render and invents `line.ending?.kind ?? 'arrival'` and
  `line.ending?.quantity ?? 0` — placeholders that exist purely to survive eager evaluation, and the
  `'arrival'` default would name the wrong act if it ever fired; suggested: resolve it to a named
  element above the return and render that as `otherwise`.

- **[blocking] The new pickers accept `isInvalid` but drop the field's error message** —
  `apps/web/src/modules/customer/components/CustomerDeliveryAddressPicker.tsx`:64 and
  `apps/web/src/modules/customer/components/CustomerPicker.tsx`:69, call site
  `.../RedirectCustomerOrderDialog.tsx`:114; rule: `docs/system/guides/heroui-design-principles.md` §2
  "Accessibility as the foundation, not an add-on" — "Preserve required accessible props (`aria-label`
  on icon-only controls, `Label`/`FieldError` pairing on form fields) rather than dropping them";
  problem: both forward `isInvalid` to `FormSelectField` but declare no `errorMessage`, so
  `FormSelectField.tsx`:90's `<FieldError>{errorMessage}</FieldError>` renders empty; the dialog
  registers `rules={{ required: translateValidation(…) }}` and then suppresses
  `CustomerOrderRefusalAlert` whenever a field error exists (`RedirectCustomerOrderDialog.tsx`:79,131)
  on the assumption the field explains it — so submitting empty leaves a red control and no sentence
  anywhere; suggested: add `errorMessage?: ReactNode` to both picker prop types, forward it to
  `FormSelectField`, and pass `errors.customerDeliveryAddressId?.message` at the call site.

### Advisory

- **[advisory] A newly added sole-owned component is a sibling of its owner rather than nested** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftViewToggle.tsx`:35; rule:
  `docs/system/frontend-architecture.md` §"Components" and
  `docs/system/guides/placing-web-components.md` §"The nesting rule"; problem: `PurchaseDraftWorkspace`
  is its only importer, yet it sits at the module `components/` root, while the same change nests
  `purchase-draft-line-delivery/`, `purchase-draft-line-directory/` and `line-ending-dialog/`
  correctly. Advisory because the flat arrangement it joins predates this change and conforming would
  move untouched files.

- **[advisory] The line editor crosses several cognitive-load budgets at once** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftLineEditor.tsx`:31-51 (8 props after
  `endingAction`) and :75-242 (≈168-line body, 5 hooks); rule:
  `docs/system/guides/writing-web-components.md` §2 "Budget the cognitive load" — "Crossing several at
  once means the component is doing more than one job"; suggested: extract the line's field block into
  an owned component so this file is the line's frame, its refusal reason and its slots.

- **[advisory] A submit handler without an explicit return type, handing the DOM a floating promise** —
  `apps/web/src/modules/workspace/components/workspace-administration/warehouses/WarehouseDeliveryAddressForm.tsx`:88;
  rule: `docs/system/guides/writing-web-components.md` §7 "Declare every event handler before the
  return" — "Give each handler an explicit return type… A handler that must discard a promise the DOM
  will not await says so"; suggested: the `(event: FormEvent<HTMLFormElement>): void => void
handleSubmit(submit)(event)` shape `SignUpForm.tsx`:38-41 already uses.

- **[advisory] The customer name-conflict field binding is hand-rolled instead of built with the shared
  constructor** — `apps/web/src/modules/customer/api/customer-api.ts`:69-72; rule:
  `docs/system/guides/web-error-handling.md` §3 "Present form errors through HeroUI" — a refusal the
  server named no field for is bound "**built with `fieldErrorsForCode`**… from a code→fields table";
  problem: `customerNameFieldErrors` re-implements that table as a bespoke ternary and, unlike the
  shared helper — whose own comment states "A failure the server already explained on a field keeps
  that explanation" — overwrites `fieldErrors` the server already set; `item-api.ts`:64,75,85 uses the
  helper for the identical shape.

- **[advisory] `CustomerCard` nests HeroUI `Card.Title`/`Card.Description` inside a hand-written
  `<button>`** — `apps/web/src/modules/customer/components/customer-directory/components/customers/CustomerCard.tsx`:55;
  rule: `docs/system/guides/heroui-design-principles.md` §2; problem: `Card.Title` renders `<h3>` and
  `Card.Description` renders `<p>`, and a `<button>` admits phrasing content only — an invalid content
  model that puts a heading inside the button's accessible-name computation.

- **[advisory] A hand-rolled `<button>` re-implements a control HeroUI's `Button` provides** —
  `apps/web/src/modules/customer/components/customer-directory/components/CustomerDetailPane.tsx`:117;
  rule: `docs/system/frontend-architecture.md` §Components; problem: the mobile back affordance is a
  native `<button>` where `Button variant="tertiary"` is the semantic control. It reproduces
  `PurchaseDraftWorkspace.tsx`:209, but sibling precedent is not a rule (shared protocol §3).

- **[advisory] `CustomerSearchField` overrides the default look instead of naming the semantic
  variant** — `.../customers/CustomerSearchField.tsx`:37; rule:
  `docs/system/guides/heroui-design-principles.md` §1 "Semantic intent over visual style"; problem:
  `className="h-12 border border-border bg-surface shadow-none"` hand-writes what `variant="secondary"`
  is documented to give ("Lower emphasis variant without shadow").

- **[advisory] An off-scale arbitrary type size on the delivery-address section heading** —
  `.../warehouses/WarehouseDeliveryAddressSection.tsx`:51; rule:
  `docs/system/guides/heroui-design-principles.md` §8 "Complete customization through tokens, not
  overrides"; problem: `text-[15px]` is the only arbitrary-value font size in `apps/web`, while every
  sibling heading in the same detail pane uses the scale.

## Verified clean

Recorded so a later run need not re-derive it:

- **Authorization** (the feature's stated first quality goal) — every control-level decision is a
  `WarehousePermissionGate`/`WorkspacePermissionGate` or a descriptor `permission` filtered by
  `usePermittedItems`; no capability table, no capability prop. `modules/customer/page.tsx`:24-26
  reading `permissionIds.includes(...)` is the "choice between two whole surfaces" case ADR
  19-08-2026 §Decision 3 explicitly permits, in the file that uses it, as `modules/access/page.tsx`:10
  already does.
- **Module home and cross-module access** — `modules/customer` is a legitimate flat home; every
  production cross-module import lands on a declared `MODULE_SURFACE` entry; the only undeclared
  reaches are in colocated specs, which the ADR excludes.
- **Contracts wiring** — the `./customers` subpath, **both** required Vite aliases
  (`vite.config.ts`:22 and :56), and `pnpm --filter @warehouser/web build` passing, so the
  exports-map/`dist` trap is genuinely closed.
- **Mutation mechanism** — every new endpoint has a `shared/alerts/mutation-actions.ts` registry entry;
  no component raises its own toast; `useCustomerActions`/`useDeliveryAddressActions` are permission
  descriptor projections, not the decorating wrappers ADR 19-08-2026 forbids.
- **Tables** — `DemandTable`, `CustomerAwaitingTable` and `DockLineTable` are HeroUI `Table`s whose row
  renderers call no hook and close over no live state; every cell renders a component.
- **Dialogs** — `CustomerDirectory` and `CustomerAddressBook` each hold their own `Kind` union,
  `useActionDialog` and total `renderDialogs`; no dialog is handed an `onClose`. `LineEndingAction`'s
  per-row `Modal` is the Action shape `web-action-dialogs.md` §1 permits, not a hand-rolled host.
- **Localization** — `en`/`uk` key trees identical modulo Ukrainian plural suffixes across all eight
  touched namespaces; every static and dynamic `t()` expansion resolves in both; every added key is
  reached by code; the `customer` namespace was added the documented way; no bare JSX copy or
  untranslated `aria-label`/`placeholder`/`title` survives.
- **HeroUI API usage** — every component used was resolved against `.heroui-docs/react` and is
  supported; no raw Tailwind palette colour anywhere in the diff.
- **Test placement** — every spec sits beside its subject; the renamed `confirm-arrival-dialog` specs
  moved with their subjects.

## Resolutions

Resolved with the user on 2026-09-04. No blocking finding is open.

### Fix now — all 12 blocking findings

Handed back as follow-up tasks through the same TDD gate `implement` uses:

1. `correctCustomerName` / `correctCustomerDeliveryAddress` (and the main-address and de/reactivation
   writes) — add `'Demand'` and `'PurchaseDrafts'` to `invalidatesTags`.
2. `setWarehouseDeliveryAddress` — add `'PurchaseDrafts'`.
3. `recordPurchaseDraftLineArrival` / `recordPurchaseDraftLineDirectDelivery` — add `'Customers'`.
4. Move `awaiting-destination.ts` to `modules/customer/utils/`, update its one importer, and restate
   its doc comment to cite `placing-web-hooks.md` §3 rather than §4.
5. `PurchaseDraftWorkspace` — replace the two stacked `Conditional`s with a total
   `Record<PurchaseDraftView, ReactElement>` lookup.
6. `DockLineTable` — take the empty copy as a prop and render it through `renderEmptyState` on
   `Table.Body`; delete the sibling paragraph and its value-ternary from `PurchaseDraftLineDirectory`.
7. `CustomerDirectory` — move `useActionDialog` + `ActionDialogHost` down to `CustomerCardList`,
   matching `CustomerAddressBook`; drop `CustomerActionHandlers` from the three intermediates' prop
   types.
8. `DirectDestinationFields` — move `DirectDestinationPickers` into its own file.
9. `RecordCustomerOrderCustomerFields` — move `RecordCustomerOrderCustomerPickers` into its own file.
10. `PurchaseDraftLineList` — remove the `endingAction` ternary; give `LineEndingAction` an
    early-return guard on `draft.state` and pass it unconditionally.
11. `LineEndingAction` — resolve the recorded-ending element above the return so `line.ending` is typed
    non-nullable where its copy is written, removing the `?? 'arrival'` and `?? 0` placeholders.
12. `CustomerPicker` / `CustomerDeliveryAddressPicker` — add `errorMessage?: ReactNode`, forward it to
    `FormSelectField`, and pass `errors.customerDeliveryAddressId?.message` in
    `RedirectCustomerOrderDialog`.

### Fix now — advisories with a one-or-two-line conforming shape

13. `customer-api.ts` — rebuild `customerNameFieldErrors` on `fieldErrorsForCode`, which also restores
    the "a failure the server already explained on a field keeps that explanation" semantic the
    hand-rolled ternary drops.
14. `WarehouseDeliveryAddressForm` — give the submit handler an explicit `: void` return type and
    discard the promise explicitly.
15. `CustomerCard` — take `Card.Title`/`Card.Description` out of the `<button>` content model.
16. `CustomerSearchField` — `variant="secondary"`, dropping the `shadow-none`/`bg-surface`/
    `border-border` overrides and keeping only the `h-12` sizing.
17. `WarehouseDeliveryAddressSection` — replace `text-[15px] font-bold` with the scale
    (`text-sm font-semibold`), matching the sibling section headings.
18. `CustomerDetailPane` — replace the hand-rolled back `<button>` with `Button variant="tertiary"`.
    _Not individually enumerated in the user's selection; taken as a cheap fix because it meets the
    same one-line criterion. Flagged here so the call is visible._

### Deferred — the two structural advisories

Recorded in `spec.md` §8 Open questions with owner + due:

- `PurchaseDraftViewToggle` nesting under `purchase-draft-workspace/components/` — conforming would
  move files this diff does not touch, and the flat arrangement it joins predates this change.
- `PurchaseDraftLineEditor` field-block extraction — a cognitive-load budget the change worsened but
  did not create.

## Next

`CHANGES REQUESTED` → `/implement delivery-addresses` for items 1–18 (no `/clear` — stay in context),
then re-run `/code-review-front-end delivery-addresses` over the changed surface. After it passes, the
branch also changes `apps/server`, so `/code-review-back-end delivery-addresses` runs before `/review`.
