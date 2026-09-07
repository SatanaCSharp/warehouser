---
id: T22
title: 'Carry the destination onto the Demand surface and add the redirect dialog'
layer: 'ui'
deps: [T13, T21]
acs: ['AC-09a', 'AC-11', 'AC-11a', 'AC-11b', 'AC-11c', 'AC-24']
files_hint:
  - 'apps/web/src/modules/customer-order/'
  - 'apps/web/src/shared/icons/'
  - 'apps/web/src/shared/alerts/mutation-actions.ts'
  - 'apps/web/public/locales/'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T22 — Carry the destination onto the Demand surface and add the redirect dialog

## Why

AC-24 makes an **absence** load-bearing: an order recorded by typed name shows no pin and no address, and that absence is what tells the member which kind of row they are looking at. Derives from approved frames `Kvxj3` and `g505i3` in [design-handoff.md](../design-handoff.md).

## What

Extend `modules/customer-order/`: `Delivery/Customer Order Row` (`GGjUJ`) and `Card Mobile` (`T0O6LF`) carry the destination line and the "recorded by typed name — no delivery address" text; the record dialog gains the customer and address fields through the picker `modules/customer` exposes; add the redirect dialog.

## Definition of Done

- [ ] The `map-pin` icon is **never** rendered for a typed-name order, and the accompanying text carries the same meaning for a screen reader.
- [ ] Identity is withheld across the whole surface for a member holding `CUSTOMER_ORDERS:WATCH` but not `CUSTOMERS:WATCH`, rendered from the redacted contract shape.
- [ ] A redirection invalidates the tags that feed the drift view, and a deactivation invalidates every picker.
- [ ] The success toast states the outcome **and** its invisible consequence — that the redirection created drift.
- [ ] Server denial is handled independently of the capability projection, including the redirect bounds the server re-checks at write time.
- [ ] Cache entries are keyed per Warehouse; en/uk parity holds with the baseline regenerated.
- [ ] `pnpm --filter @warehouser/web build` passes; lint + vet clean.

## Notes

The destination lives in **`modules/customer-order`**, not `modules/demand` — [sad.md §11](../sad.md) settles the naming split with `design-handoff.md` in favour of what the repository ships; the destination, label and copy stay **Demand**. Client-side redaction is presentation only: the server independently never sends what the actor may not read.
