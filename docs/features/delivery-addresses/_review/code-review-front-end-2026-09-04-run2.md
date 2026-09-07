# Frontend conformance review — delivery-addresses (2026-09-04, run 2)

- **Work item:** `docs/features/delivery-addresses` (feature; `.size` = L, `.route` = full)
- **Skill:** `code-review-front-end`
- **Verdict:** `CHANGES REQUESTED`
- **Supersedes:** nothing. This is the re-review that
  [`code-review-front-end-2026-09-04.md`](./code-review-front-end-2026-09-04.md) hands off to; that
  record still owns the full-branch findings and their resolutions. Filename carries a `-run2` suffix
  because both runs fall on the same date.

## Diff scope

```
git diff f91bf83..HEAD -- apps/web packages/contracts
41 files changed, 1339 insertions(+), 323 deletions(-)
```

`f91bf83` is the commit immediately before the five fix commits. Scope is deliberately the **fix
commits only** — the full branch was reviewed in run 1, and findings here are restricted to lines
these commits wrote or moved (shared protocol §7 "Reviewing the whole repository"). `apps/server` is
out of scope for this skill.

`docs/system` is byte-identical to run 1 (verified with `git diff f91bf83..HEAD -- docs/system`,
empty), so the run-1 manifest carries over unchanged. Each reviewer re-read it in full regardless.

## Document manifest

Identical to run 1 — see that record for the full list. Read in full this run: `web-index.md`,
`frontend-architecture.md`, `architecture-map.md`, all nine Accepted web ADRs, and the guides
`placing-web-components.md`, `writing-web-components.md`, `writing-web-conditional-components.md`,
`placing-web-hooks.md`, `placing-web-tests.md`, `adding-a-web-module.md`, `web-dialogs.md`,
`web-action-dialogs.md`, `web-error-handling.md`, `adding-and-using-contracts.md`,
`adding-and-maintaining-web-localization.md`, `heroui-design-principles.md`,
`heroui-react-v3-docs-index.md`. HeroUI components were resolved against `.heroui-docs/react` and,
where the docs were silent, against the installed `@heroui/styles` and `@heroui/react` sources.

## Method

Three clean-context reviewers at the reasoning tier, effort `xhigh`. Each was asked to do two things
the first run could not: verify every prior fix **CLOSED or DID NOT CLOSE**, and hunt for violations
the fixes themselves introduced. Two briefs were sharpened against the specific risk that the same
agent wrote both a fix and its tests:

- the state reviewer had to **independently re-derive** the correct tag set for every affected
  endpoint from the contracts, and report both under- and over-invalidation;
- the test reviewer had to diff every changed spec before/after, treating a loosened assertion, a
  removed case or a quietly-changed pinned count as **blocking**.

## Findings

### Blocking

- **[blocking] `addCustomerDeliveryAddress` moves `isMain` but still invalidates only `Customers`** —
  `apps/web/src/modules/customer/api/customer-api.ts`:194, with the policy comment these commits wrote
  at :123-130 and the negative pinned at `apps/web/src/modules/customer/api/customer-api.spec.ts`:181;
  rule: `docs/system/adr/02-08-2026-rtk-query-for-web-api-calls.md` §Decision — "Mutations declare
  invalidation tags whenever they can make cached query results stale", restated in
  `docs/system/frontend-architecture.md` §"Redux Toolkit infrastructure"; problem: the endpoint takes
  `customerDeliveryAddressCreateSchema`, whose contract states `main: true` "makes the address the
  Customer's Main address and **clears the previous Main flag in the same transaction**"
  (`packages/contracts/src/customers/customers-mutations.ts`:36-43); the server implements it as a
  second `setMainDeliveryAddress` write (`add-customer-delivery-address.command.ts`:88-96) and the UI
  offers it as a checkbox (`AddDeliveryAddressDialog.tsx`:109, submitted at :67). `isMain` is a live
  field of `customerOrderDestinationSchema` served under `Demand` and `PurchaseDrafts`, and
  `invalidatesTags` is a static literal that cannot vary by argument — so ticking Main on a new
  address leaves every cached Demand row and draft link showing the demoted address still flagged
  Main. The same commits accepted this exact reasoning twice elsewhere
  (`setMainCustomerDeliveryAddress` got all three tags; `deactivateCustomerDeliveryAddress`'s comment
  cites the AC-06b Main promotion), so the slice now treats one state change two ways; suggested:
  `invalidatesTags: ['Customers', 'Demand', 'PurchaseDrafts']`, plus a `main: true` case in the spec
  table and a correction to the endpoint comment and spec header that both assert it is inert.

**Why run 1's tests did not catch it.** The fix and its spec were written by the same agent, which
reasoned "a new address is neither referenced nor Main" — true for the default, false when the
checkbox is ticked — and then pinned that premise as a passing negative using a `main: false` fixture
(`customer-api.spec.ts`:130). An author-written test cannot falsify the author's own premise; only
the independent re-derivation found it.

### Advisory

- **[advisory] The fix-5 lookup pushed `PurchaseDraftWorkspace` past three budgets at once** —
  `apps/web/src/modules/purchase-draft/components/PurchaseDraftWorkspace.tsx`:165-202 (the added
  `viewContent`), body at :90-244; rule: `docs/system/guides/writing-web-components.md` §2 "Budget the
  cognitive load" — "Component length | about one screen (~100 lines)", "Hook calls in one component |
  5", "Crossing several at once means the component is doing more than one job"; problem: replacing
  the stacked `Conditional`s was correct, but it hoisted the whole 33-line `byDraft` split above the
  return, taking the body to ~155 lines while the component already calls six hooks and now declares
  two render lookups; suggested: extract the `byDraft` split into an owned component in the
  `purchase-draft-workspace/components/` home `spec.md` §8 already reserves for
  `PurchaseDraftViewToggle`, leaving `viewContent` two named elements with its totality intact.

- **[advisory] The same hand-rolled back `<button>` fix 18 replaced was moved verbatim, not
  converted** — `apps/web/src/modules/purchase-draft/components/PurchaseDraftWorkspace.tsx`:188-195;
  rule: `docs/system/frontend-architecture.md` §"Components" and
  `docs/system/guides/heroui-design-principles.md` §1 "Semantic intent over visual style" ("`tertiary`
  sparingly for dismissive actions"); problem: commit `73274c2` moved this native `<button>` into the
  new lookup while commit `bf06a7f` converted the byte-identical control in `CustomerDetailPane.tsx`
  :122-130 to `Button variant="tertiary" size="sm"`, so the feature ships two spellings of one
  control; suggested: the `Button variant="tertiary"` shape `CustomerDetailPane` now uses.
  _(Found independently by two reviewers.)_ **Cause: the review lead's lane split** — L3 was told not
  to touch this file and L2's brief never included the conversion. Not an agent error.

## Prior fixes — closure

All 18 fixes from run 1 **CLOSED**, verified against the rule each was raised under. Fix 1 closed for
the four endpoints it touched; the fifth write that moves the same state was not brought with them,
which is the blocking finding above.

Notable confirmations rather than assertions: fix 13's composition order was traced end to end
(`customerNameFieldErrors(formFieldNames(failure))` renames the server's spelling first, then
`fieldErrorsForCode` short-circuits on the now-present `fieldErrors`, and `api-client.ts`:63-66 never
emits an empty `fieldErrors`, so the truthiness check has no false-positive arm). Fix 12 was checked
at all four production call sites — none is left marking a field without a message, and the
`isFieldExplained` suppression is now sound in both the client-`required` and server-`fieldErrors`
paths. Fixes 8/9 left authorization unchanged: `useCustomers()` remains inside the
`WarehousePermissionGate` in both split files, so no request is issued for a dataset the actor may not
read.

## Tests

**No test was weakened** — every changed spec was diffed before/after:

- `PurchaseDraftWorkspace.spec.tsx` — reseeding from `ready_for_ordering` to `draft` is a
  **strengthening**: the default tab is `draft`, so under the old seed a pre-existing
  `not.toBeInTheDocument()` assertion could pass vacuously.
- `PurchaseDraftLineDirectory.spec.tsx` — `findByText` → `within(dock).getByText` scoped to the grid.
  Strictly stronger.
- `LineEndingAction.spec.tsx`, `CustomerDirectory.spec.tsx`, `purchase-draft-api.spec.ts` — additive
  only; existing expectations byte-identical.
- `readiness-removal.spec.ts` — path renames only; both pinned gate counts stay at `4`, and the count
  was verified genuine (import identifier + path + open tag + close tag) rather than accidentally
  preserved.

Placement is conformant, including `src/test/one-component-per-file/one-component-per-file.spec.ts` as
the structural-gate case `placing-web-tests.md` §3 sanctions, with the header comment it requires. The
gate is **not vacuous** — its logic was run against the two pre-fix blobs and flags both offenders it
was written for.

Three properties of that gate are recorded for whoever widens it (none is a `docs/system` breach, so
none is a finding): its props-type match runs over the helper's whole span, so a helper with inline
props whose body annotates a local with the file's exported type is a false positive; and a
`function Helper(...)` declaration and a `forwardRef` helper match neither pattern, while the
repository does use `forwardRef` (`PasswordInput.tsx`:46, `FormTextField.tsx`:49).

## Verified clean

- **Localization** — no locale JSON, no `src/test/locale-baseline.json` and no `packages/contracts`
  file appears anywhere in `f91bf83..HEAD`, verified mechanically. The only accessible-name literal
  added is `<ul aria-label={label}>` at `CustomerCardList.tsx`:94, whose `label` is a `t()` call. No
  bare JSX copy, no untranslated `placeholder`/`title`.
- **HeroUI API usage** — `variant` confirmed a root `SearchField` prop; `Button`'s `variant`/`size`/
  `onPress` confirmed; `EmptyState` confirmed a real v3 export used in its documented shape;
  `renderEmptyState` confirmed `() => React.ReactNode`; `role="status"` confirmed additive rather than
  overriding a role `EmptyStateRoot` sets.
- **Cache tags** — an independently derived table covering all twelve affected endpoints found exactly
  one discrepancy (the blocking finding). **No endpoint over-invalidates.**
- **Mutation mechanism, dialogs, module boundaries** — unchanged and conformant; no wrapper hook
  introduced, no toast moved into a component, every cross-module import still lands on a declared
  `MODULE_SURFACE` entry.

## Design note — not a finding

Fix 16's `variant="secondary"` is correct per `heroui-design-principles.md` §1 and §8, but the result
is **not pixel-identical**: the variant sets `background-color: var(--default)` where the deleted
class said `bg-surface`, and the border reverts from `--border` to `--field-border`. That is the
component's documented default rather than an override, so the code is right and no finding is raised.
Resolved with the user as **leave the code, reconcile on the design board** — if a frame fixes the
surface token, the drift belongs there, not in this file.

## Resolutions

Resolved with the user on 2026-09-04.

- **Blocking — `addCustomerDeliveryAddress` tags: Fix now.** Through the same TDD gate `implement`
  uses, including the `main: true` spec case and the two comments that assert inertness.
- **Advisory — `PurchaseDraftWorkspace` budgets: Fix now.** Extract the `byDraft` split into
  `purchase-draft-workspace/components/`, which also closes the `PurchaseDraftViewToggle` nesting item
  deferred in `spec.md` §8.
- **Advisory — back-affordance inconsistency: Fix now.** Convert to `Button variant="tertiary"`.
- **Design note — SearchField token drift: leave the code, note for design.** Recorded above.

## Next

`CHANGES REQUESTED` → `/implement delivery-addresses` for the three fixes (no `/clear` — stay in
context), then re-run this skill over the changed surface. After it passes, the branch also changes
`apps/server`, so `/code-review-back-end delivery-addresses` runs before `/review`.
