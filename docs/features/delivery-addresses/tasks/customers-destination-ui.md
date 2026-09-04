---
id: T21
title: 'Build the Customers web destination with its address book, awaiting list, dialogs and the shared customer picker'
layer: 'ui'
deps: [T10]
acs:
  [
    'AC-01',
    'AC-02',
    'AC-03',
    'AC-03b',
    'AC-03c',
    'AC-04',
    'AC-05',
    'AC-06',
    'AC-06a',
    'AC-06b',
    'AC-07',
    'AC-08',
    'AC-09',
    'AC-23',
  ]
files_hint:
  - 'apps/web/src/modules/customer/'
  - 'apps/web/src/shared/constants/routes.ts'
  - 'apps/web/src/shared/layouts/Sidebar.tsx'
  - 'apps/web/src/shared/icons/'
  - 'apps/web/src/shared/alerts/mutation-actions.ts'
  - 'apps/web/vite.config.ts'
  - 'apps/web/public/locales/'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T21 — Build the Customers web destination with its address book, awaiting list, dialogs and the shared customer picker

## Why

The Customers destination is where a member maintains the record once instead of retyping it, and it is the first web surface where a refused Permission must mean **no request at all** rather than a rejected one. Derives from approved frames `KRDln` and `b7gaH9` in [design-handoff.md](../design-handoff.md) and [sad.md §5 Web](../sad.md).

## What

Add `modules/customer/` following the shipped `modules/item/` shape: `route.tsx`, `page.tsx`, a loader gated on `CUSTOMERS:WATCH`, `api/`, `components/`, `hooks/`, `schemas/` and `alerts/`. Build `Delivery/Customer Card` (`r80F1`), `Address Row` (`LdZmY`), `Awaiting Row` (`zw3n9`) and `Awaiting Card Mobile` (`XXFuv`); the record, correct, deactivate and address dialogs through `useActionDialog` + `ActionDialogHost`; and the **customer and address picker** on the module's declared public surface. Add `ROUTE_SEGMENTS.CUSTOMERS` / `ROUTES.WAREHOUSE_CUSTOMERS`, the sidebar entry at index 4, and the three hand-rolled icons `contact`, `map-pin`, `package-check`.

## Definition of Done

- [ ] The destination is unreachable and the sidebar entry **absent** — not disabled — without `CUSTOMERS:WATCH`, and the refused loader issues **zero** requests.
- [ ] No count, badge or total appears on the entry or anywhere reachable without the Permission.
- [ ] The address and access notes render as **text**, never as markup and never as a link.
- [ ] Reuses `FormModalDialog`, `ConfirmAlertDialog`, `FormTextField`/`FormSelectField`, `DatasetCard` and HeroUI `Table`/`Tabs`/`Chip` — the deactivate dialogs validate nothing and take the alert dialog, not the form dialog.
- [ ] The picker is reached through the module's public surface and a Customer never crosses the Warehouse boundary in cache or in a picker.
- [ ] Cache entries are keyed per Warehouse and switching refetches.
- [ ] en/uk parity holds and `apps/web/src/i18n.spec.ts` passes with the baseline regenerated **in its existing key order**, removing no key and changing no value.
- [ ] **Both** `@warehouser/contracts/customers` vite aliases are added and `pnpm --filter @warehouser/web build` passes.
- [ ] The approved 1440 and 390 layouts render as drawn; lint + vet clean.

## Notes

**[sad.md §10](../sad.md) gate 3 is the trap this task must not fall into:** a new contracts subpath needs _two_ aliases in `apps/web/vite.config.ts` — the subpath and a bare `'customers'` — and missing them breaks **only** the web build while the entire test suite stays green. That is exactly how `ordering` left `apps/web` unbuildable across several commits. The build command is part of this task's DoD, not an optional extra. Shares the locale-baseline lane with T11, T22, T23 and T24.
