# Front-end conformance review — ordering

- **Work item:** feature `ordering` (`docs/features/ordering`), `.size` XL, `.route` full
- **Branch:** `22-ordering`; base (branch point) `9bc822b`
- **Date:** 2026-08-26
- **Reviewer:** `reviewer` worker, clean context, `reasoning` tier at effort `xhigh`, fanned out
  across three dimension groups (A / B+C / D+E) and merged
- **Verdict:** `CHANGES REQUESTED`

## Diff scope

```sh
git diff 9bc822b043200c17566cc9f501e6674e50561f61..HEAD -- apps/web packages/contracts
```

131 files changed, 10 856 insertions, 26 deletions. 118 files under `apps/web/`, 13 under
`packages/contracts/`.

Three new web modules — `modules/item`, `modules/customer-order`, `modules/purchase-draft` — plus
their routes, loaders, API slices, dialogs, locale namespaces, eight shared icons, and changes to
`router.ts`, `i18n.ts`, `shared/alerts/mutation-actions.ts`, `shared/components/FormModalDialog.tsx`,
`shared/components/ConfirmAlertDialog.tsx`, `shared/constants/routes.ts`, `shared/layouts/Sidebar.tsx`
and `test/module-boundaries/module-surface.ts`.

`packages/contracts` was judged **only** for how `apps/web` declares and consumes the schema; the
server side of those files belongs to `/code-review-back-end`. `apps/server` changed in the same
branch and is **not** reviewed here.

## Document manifest

Every document below was read in full this run. `docs/system/web-index.md` is the authority; the
skill's `references/web-manifest.md` selector agreed with it on every entry (no disagreement to
report).

**Floor**

- `docs/system/web-index.md`
- `docs/system/frontend-architecture.md`
- `docs/system/architecture-map.md`
- `docs/system/sad.md`

**Guides selected by the changed paths**

- `docs/system/guides/adding-a-web-module.md`
- `docs/system/guides/placing-web-components.md`
- `docs/system/guides/writing-web-components.md`
- `docs/system/guides/writing-web-conditional-components.md`
- `docs/system/guides/web-dialogs.md`
- `docs/system/guides/placing-web-hooks.md`
- `docs/system/guides/placing-web-tests.md`
- `docs/system/guides/sharing-web-state-with-context.md`
- `docs/system/guides/web-error-handling.md`
- `docs/system/guides/adding-and-maintaining-web-localization.md`
- `docs/system/guides/heroui-design-principles.md`
- `docs/system/guides/heroui-react-v3-docs-index.md`
- `docs/system/guides/adding-and-using-contracts.md`

**Accepted ADRs**

- `docs/system/adr/19-08-2026-declarative-permission-gates.md`
- `docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`
- `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md`
- `docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md`
- `docs/system/adr/27-07-2026-bundled-centralized-web-translations.md`
- `docs/system/adr/12-07-2026-schema-validation-with-zod.md`
- `docs/change-requests/global-loader/adr/0001-module-owned-route-loaders.md`

**Superseded, read for reasoning only**

- `docs/system/adr/14-08-2026-domain-owned-flat-modules.md`

**Read for context, never as the rule**

- `docs/features/ordering/sad.md` (`target_surfaces`, §1, §5–§6)
- `docs/features/ordering/adr/0001-entity-owned-ordering-modules.md` — Accepted; sanctions the three
  flat web modules the diff creates. It narrows nothing this review relied on.
- `docs/features/ordering/adr/0002-arrival-confirmation-ownership.md`
- `docs/features/ordering/design-handoff.md` (approved 2026-08-25)

## Findings

All nine blocking findings were verified against the code by the reviewing agent's citations and a
second independent read before resolution.

### Blocking

- **[blocking] `modules/purchase-draft` leaves an owned component subtree flat beside its owner** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftWorkspace.tsx`:5-6; rule:
  `docs/system/guides/placing-web-components.md` §"The nesting rule"; problem: `PurchaseDraftWorkspace`
  is the sole production importer of `PurchaseDraftDetailPane` and `PurchaseDraftList`, which sit as
  its siblings at the module `components/` root; the chain repeats — `PurchaseDraftList.tsx`:3 solely
  owns `PurchaseDraftCard`, `PurchaseDraftDetailPane.tsx`:11-12 solely owns
  `purchase-draft-transitions/` and `PurchaseDraftLineEditor` — leaving 8 files at one root, while the
  two sibling modules in the same diff (`item/components/item-directory/`,
  `customer-order/components/demand-directory/`) nest correctly; suggested: move the owner to
  `components/purchase-draft-workspace/` and its owned subtree into that owner's `components/`, specs
  moving with them. `DriftSignal` (3 consumers) and `PurchaseDraftLinkRow` (2 consumers) are genuinely
  multi-consumer and stay at the shared ancestor level per §"When not to nest".
  **Resolution: Fix now.**

- **[blocking] A failed dataset read renders the empty surface, not an error arm** —
  `apps/web/src/modules/item/hooks/queries/useItems.ts`:14,
  `apps/web/src/modules/purchase-draft/hooks/queries/usePurchaseDrafts.ts`:15,
  `apps/web/src/modules/purchase-draft/hooks/queries/usePurchaseDraft.ts`:16; rule:
  `docs/system/frontend-architecture.md` §Page ("error, empty and success stay with the narrowest
  component … so a permitted actor whose read failed still reaches that component's own error arm
  rather than an empty surface"); problem: all three hooks return only `currentData ?? []` and drop
  `isError`, and the loaders `await` `initiate()` without `unwrap()`, so a failed read reaches neither
  the `errorComponent` nor a component error arm — `ItemPage` paints "No items yet.",
  `PurchaseDraftList` paints `workspace.empty`, `PurchaseDraftWorkspace.tsx`:57 paints `detail.empty`;
  `useDemand.ts`:20 keeps `isError` and its doc-comment states this exact rule, so the omission is
  inconsistent within one change; suggested: return `{ isError, items }` as `useDemand` does and wire
  the narrowest owner's error arm — the `item.json` `directory.error` and `purchase-draft.json`
  `workspace.error` copy already exists but is bound only to the permission branch.
  **Resolution: Fix now.**

- **[blocking] Purchase Draft writes make the `Demand` cache stale but invalidate only
  `PurchaseDrafts`** — `apps/web/src/modules/purchase-draft/api/purchase-draft-api.ts`:290
  (`confirmPurchaseDraftArrival`), identically at :221, :244, :265, :277, :303; rule:
  `docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md` §Decision ("Mutations declare
  invalidation tags whenever they can make cached query results stale"); problem: confirming an arrival
  allocates against Customer Orders and link edits change `DemandLine.coverage`, both served by the
  `Demand`-tagged `readDemand`/`listCustomerOrders`, so the Demand destination keeps a stale reading;
  `customer-order-api.ts`:102 invalidates `['Demand','Items','PurchaseDrafts']` in the opposite
  direction; suggested: add `'Demand'` to every link- and arrival-affecting purchase-draft mutation.
  **Resolution: Fix now.**

- **[blocking] On-hand adjustment does not invalidate the Demand read it changes** —
  `apps/web/src/modules/item/api/item-api.ts`:95, and :67, :75, :83; rule:
  `docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md` §Decision; problem:
  `DemandLine.onHandQuantity`, `sku` and `description` are served by the `Demand`-tagged `readDemand`,
  but these mutations invalidate only `Items`, so the Demand table keeps the pre-adjustment figure;
  suggested: `invalidatesTags: ['Items', 'Demand']`.
  **Resolution: Fix now.**

- **[blocking] Private helper components that own data access and a named props type** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftDetailPane.tsx`:78
  (`PurchaseDraftLineList` — `useEnteredWarehouse`, `usePackagingTypes` and four generated mutation
  triggers, six hook calls) and :33 (`DriftAlert`);
  `apps/web/src/modules/item/components/item-directory/ItemDirectory.tsx`:50 (`ItemCardMobile`, props
  type at :35, `useItemActions`);
  `apps/web/src/modules/customer-order/components/demand-directory/components/DemandCardMobile.tsx`:34
  (`CustomerOrderCardMobile`, props type at :22, `useCustomerOrderActions`); rule:
  `docs/system/guides/writing-web-components.md` §1 ("Move a helper into its own file as soon as any of
  these becomes true: … it needs a props type worth naming and exporting; it grows its own state,
  effects, or data access"); problem: each has both a named props type and hook-based data access, so
  none is the `DatasetMessage`-style render helper §1 permits — `PurchaseDraftLineList` is the file's
  real mutation owner while the file is named for the pane; suggested: give each its own file under the
  owner's `components/` directory per `placing-web-components.md`.
  **Resolution: Fix now.**

- **[blocking] Ternary choosing between elements inside JSX** —
  `apps/web/src/modules/customer-order/components/demand-directory/components/DemandCardMobile.tsx`:141
  (`{isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}`); rule:
  `docs/system/guides/writing-web-components.md` §6 ("Never branch between elements with a ternary");
  problem: the branch is written as punctuation in the markup, while its sibling `DemandRow.tsx`:53
  resolves the identical choice to a named `disclosureIcon` above the `return`; suggested: resolve it to
  a named element above the `return`, as `DemandRow` does.
  **Resolution: Fix now.**

- **[blocking] Purchase-draft line editing is offered with no permission gate** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftDetailPane.tsx`:144, and the controls it
  renders at `PurchaseDraftLineEditor.tsx`:106, :129, :139, :181; rule:
  `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 1; problem:
  `PurchaseDraftLineList` renders enabled quantity/packaging/note fields, a remove-line button and an
  unlink button for anyone who reached the destination, which is gated on `PURCHASE_DRAFTS:WATCH` only
  (`purchase-draft/page.tsx`:21), while every one of those writes requires `PURCHASE_DRAFTS:UPDATE`; a
  watch-only member is offered controls that can only be refused, and the offer is expressed nowhere.
  Every sibling surface in the same module does gate (`DiscardPurchaseDraftAction.tsx`:35,
  `ReadyPurchaseDraftAction.tsx`:37, `ClosePurchaseDraftAction.tsx`:39, `ConfirmArrivalAction.tsx`:43);
  suggested: wrap the editable arm in
  `<WarehousePermissionGate permission={PermissionId.PURCHASE_DRAFTS_UPDATE}>`, kept separate from the
  existing `isFrozen` record-state rule per §Decision 4.
  **Resolution: Fix now.**

- **[blocking] No ordering API error code has a translated description** —
  `apps/web/src/shared/errors/api-error.ts`:14 (`errorTranslationKeys`) and
  `apps/web/public/locales/{en,uk}/errors.json` (untouched by the diff); rule:
  `docs/system/guides/web-error-handling.md` §5 ("Map known server and validation codes explicitly to
  typed i18next keys") and §6 ("Ensure every public API error code … has a translation in every
  supported locale"); problem: the diff adds the whole ordering UI, whose endpoints return
  `items.sku_taken`, `items.invalid_on_hand_quantity`, `customer_orders.needed_by_in_past`,
  `customer_orders.quantity_below_allocated`, `purchase_drafts.draft_empty`,
  `purchase_drafts.allocation_out_of_bounds` and roughly fifteen more, none of which is mapped, so
  `alertApiFailure` falls through to `api.unexpected` for every ordering failure; suggested: add
  `items`/`customerOrder`/`purchaseDraft` blocks to `errors.json` in both locales and the matching
  `errorTranslationKeys` entries.
  **Resolution: Fix now.**

- **[blocking] Feature controls hand-rolled as native `<button>` instead of HeroUI** —
  `apps/web/src/modules/item/components/item-directory/ItemDirectory.tsx`:87; rule:
  `docs/system/frontend-architecture.md` §Components ("Use HeroUI from `@heroui/react`") and
  `docs/system/guides/heroui-design-principles.md` §9; problem: `ItemCardMobile` renders each permitted
  action as a bare unstyled `<button type="button" onClick>` — no `Button`, no semantic `variant`, no
  React Aria press/focus treatment — duplicating a primitive that exists; its desktop twin
  `ItemRow.tsx`:52 uses `Dropdown` + `Button`, and the handoff states the mobile card keeps identical
  kebab behaviour. The same shape recurs at `PurchaseDraftWorkspace.tsx`:107 and
  `PurchaseDraftCard.tsx`:33; suggested: use `Button` (or `Dropdown` + kebab, matching
  `DemandCardMobile.tsx`:52) with a semantic variant, and `buttonVariants`/`linkVariants` from
  `@heroui/styles` where a framework-native element is genuinely required.
  **Resolution: Fix now.**

### Advisory — fix now

- **[advisory] Authorization read bypasses the named hook** — `apps/web/src/modules/item/page.tsx`:22,
  `purchase-draft/page.tsx`:21, `customer-order/page.tsx`:28; rule:
  `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 3; problem: the two-surface
  choice is a legitimate boolean read, but it is taken as
  `useCurrentPermissions().permissionIds.includes(...)` rather than through `useHasPermission`, which
  the ADR names as the form of that read; suggested: `useHasPermission(PermissionId.ITEMS_WATCH)`.
  **Resolution: Fix now.**

- **[advisory] Authorization and a failed read fused into one branch and one message** —
  `apps/web/src/modules/customer-order/page.tsx`:26-30; rule:
  `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 4 ("Rules stay separated, one
  per gate"); problem: `!access || !permissionIds.includes(CUSTOMER_ORDERS_WATCH) || isError` renders a
  single arm whose copy is `demand.error` = "Demand could not be loaded.", so a refused member is told
  the read failed; suggested: an early-return authorization arm with its own denial copy, then a
  separate error arm.
  **Resolution: Fix now.**

- **[advisory] Request body shapes re-declared locally instead of taken from the contract** —
  `apps/web/src/modules/purchase-draft/api/purchase-draft-api.ts`:83-85 and
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftLineEditor.tsx`:23-27; rule:
  `docs/system/frontend-architecture.md` §"Validation and server contracts" ("Do not duplicate a server
  request schema locally"); problem: `PurchaseDraftRevise` and `PurchaseDraftLineUpdate` exist in
  `@warehouser/contracts/purchase-drafts` and are already imported in the same file for neighbouring
  endpoints, so the hand-written copies can drift silently; suggested: import both.
  **Resolution: Fix now.**

- **[advisory] `Alert.Description` given block content** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftDetailPane.tsx`:54; rule:
  `docs/system/guides/heroui-design-principles.md` §3; problem: `Alert.Description` renders a `<span>`,
  and a `<ul>` plus a `<p>` are nested inside it — invalid phrasing content; suggested: keep the
  description one line and make the drifted-link `<ul>` and the `<p>` siblings inside `Alert.Content`.
  **Resolution: Fix now.**

- **[advisory] `translateValidation` omitted by dialogs that pass `parse`** —
  `apps/web/src/modules/item/components/item-directory/components/CorrectItemDialog.tsx`:64 and
  `apps/web/src/modules/customer-order/components/demand-directory/components/AmendCustomerOrderDialog.tsx`:65;
  rule: `docs/system/guides/web-dialogs.md` §3 ("Omit `translateValidation` only when the dialog has no
  `parse` and expects no `fieldErrors`"); problem: both hand `parse` over without it, so any code either
  parse or the endpoint produces would set no field message at all; suggested: pass a
  `translateValidation` for the fields they register, or drop `parse` and shape the request in
  `onSubmit`.
  **Resolution: Fix now.**

- **[advisory] An unchanged blur still writes, and therefore still toasts** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftLineEditor.tsx`:64 and :80; rule:
  `docs/system/guides/web-error-handling.md` §4; problem: leaving the ordered-quantity or note field
  fires `revisePurchaseDraftLine` even when the value is unchanged, and that endpoint is registered in
  `mutation-actions.ts`:110, so tabbing through the form raises a pending toast and "Line saved." for a
  change the member did not make; suggested: compare against the line's current value before triggering.
  **Resolution: Fix now.**

### Advisory — deferred

Recorded in `spec.md` §8 Open questions.

- **[advisory] Every refusal in eight of nine new dialogs renders one fixed sentence** —
  `apps/web/src/modules/item/components/item-directory/components/CreateItemDialog.tsx`:84 and the same
  shape in `CorrectItemDialog`, `AdjustOnHandDialog`, `DeactivateItemDialog`, `RecordCustomerOrderDialog`,
  `AmendCustomerOrderDialog`, `CancelCustomerOrderDialog`, and the Ready/Discard/Close dialogs; rule:
  `docs/system/guides/web-error-handling.md` §5 and §3; problem: `onRefusal` is used only as a boolean
  and the alert reads "Nothing has changed." for every code, so a taken SKU, a quantity below what is
  allocated, and a frozen draft are indistinguishable; no endpoint declares a `transformErrorResponse`,
  so no refusal is bound to the field that explains it either; `ConfirmArrivalDialog.tsx`:53 shows the
  conforming shape; suggested: map each endpoint's refusal codes to keys, or bind them to a field with
  `fieldErrorsForCode` beside the endpoint.
  **Resolution: Defer.**

- **[advisory] Dead exported surface: a picker and four mutation hooks no caller uses** —
  `apps/web/src/modules/customer-order/components/CustomerOrderPicker.tsx`:27 and
  `apps/web/src/modules/purchase-draft/api/purchase-draft-api.ts`:326-331; rule:
  `docs/system/guides/writing-web-components.md` §9 ("Delete dead branches"); problem: a component and
  four generated hooks ship with no consumer, and `sad.md` §5 Web claims the picker is on
  `modules/customer-order`'s declared surface when it is not; suggested: wire them or remove them and the
  surface claim. Tied to the unwired assembly path noted for `/review`.
  **Resolution: Defer.**

- **[advisory] `ItemDirectory` crosses two cognitive-load budgets at once** —
  `apps/web/src/modules/item/components/item-directory/ItemDirectory.tsx`:111; rule:
  `docs/system/guides/writing-web-components.md` §2 and §3; problem: 242 lines and seven hook calls while
  owning the desktop table, the mobile list, the dialog lookup and every mutation binding; suggested:
  split the mutation bindings and dialog lookup out of the rendering. Partly addressed by the B5 fix.
  **Resolution: Defer.**

- **[advisory] `useItems` read one component too high, forcing a surface entry** —
  `apps/web/src/modules/customer-order/components/demand-directory/components/RecordCustomerOrderDialog.tsx`:7,42,83;
  rule: `docs/system/guides/placing-web-hooks.md` §4 and
  `docs/system/guides/adding-a-web-module.md` §2; problem: the dialog calls `useItems()` and threads the
  array into `ItemPicker` as a prop, forcing `modules/item/hooks/queries/useItems` onto the declared
  surface beside the picker; suggested: call `useItems()` inside `ItemPicker` — RTK Query dedupes — and
  drop the surface entry.
  **Resolution: Defer.**

- **[advisory] Two of three new contract subpaths get no source alias** —
  `apps/web/vite.config.ts`:18; rule: `docs/system/guides/adding-and-using-contracts.md` §4; problem:
  `items` is aliased to `packages/contracts/src` like `access`/`auth`/`users`/`workspaces`, while
  `customer-orders` and `purchase-drafts` resolve through `dist/`, so a schema change to them is
  invisible to the dev server and vitest until `@warehouser/contracts` is rebuilt; suggested: alias all
  three consistently.
  **Resolution: Defer.**

- **[advisory] A colocated module spec reaches into another module's undeclared internals** —
  `apps/web/src/modules/customer-order/api/customer-order-api.spec.ts`:4; rule:
  `docs/system/guides/adding-a-web-module.md` §2; problem: it imports `modules/item/api/item-api`, which
  is not on `MODULE_SURFACE.item`; the boundary spec's production-only scan means the crossing passes
  silently; suggested: use the declared `useItems` entry, or record it the way
  `PERMITTED_TEST_ONLY_COUPLINGS` records the existing one.
  **Resolution: Defer.**

## Noted for `/review` (not adjudicated here)

Acceptance-criteria compliance is `/review`'s gate. Two observations were surfaced and passed on:

- Purchase-draft assembly is unwired. `PurchaseDraftDetailPane.tsx`:134-139 records "adding a line and
  adding a new link are left as seams", and there is no caller for creating a draft or setting its
  Expected Arrival Date, while `mutation-actions.ts`:105 and the `purchase-draft.json`
  `workspace.newDraft` / `detail.addLine` copy already exist. Bears on AC-10, AC-10a, AC-11, AC-12.
- `AmendCustomerOrderDialog.tsx`:46-57 and `CorrectItemDialog.tsx`:44-55 submit `{}` when nothing
  changed, which `customerOrderAmendSchema` / `itemUpdateSchema` refuse with `minProperties: 1`, so the
  actor receives a server refusal rather than a no-op or a disabled submit.

## Crossover

`apps/server` changed in the same branch and is out of scope here. Run
`/code-review-back-end ordering` for it. `packages/contracts` DTO adaptation in `rest/dtos/` likewise
belongs to that skill.
