---
status: Living
updated_at: '2026-09-01'
---

# Roadmap

Outcomes, not a feature list and not a dated plan. Each item states the outcome we are buying and
links to the feature folder where the solution is specified. Horizons are **Now** (in delivery),
**Next** (committed, not started), **Later** (candidate), and **Shipped**.

## Now

- **An organization can operate several warehouses under one identity.** Today a user belongs to
  exactly one warehouse and registration is the only way a warehouse can exist, so a second site
  means a second, disconnected account. Introduces the Workspace as the boundary above the
  Warehouse, owning the warehouse lifecycle and its own roles, permissions, and membership.
  → [`docs/features/workspaces`](features/workspaces/spec.md) · size L · route full · status: spec drafted

- **A warehouse can answer what its customers are waiting for, and turn that into an order the
  supplier can fulfil correctly.** Today the decision "what do I phone the supplier about" is
  reconstructed each morning from notes and a spreadsheet, and the order that follows exists only as
  a phone call that nothing can attribute to a customer afterwards. Consolidates unfulfilled
  customer demand per item, shows it beside what the transit zone already holds, and records the
  order as a draft carrying how the goods must physically arrive — introducing the first business
  entities the warehouse owns.
  → [`docs/features/ordering`](features/ordering/spec.md) · size XL · route full · status: spec drafted

- **Goods can go straight from the supplier to the customer, and every order says where it is
  going.** Today a customer is a name typed by hand, so one company fragments across three
  spellings and none of them has an address; an order to a supplier never records where the goods
  should be sent; and the only ending is that they arrive at our own dock. Makes a customer a
  record carrying the addresses its goods may be sent to, gives each order line a delivery mode and
  a delivery address that freeze with the rest of the order, and reports it when the customer's address
  moves out from under a shipment already in transit.
  → [`docs/features/delivery-addresses`](features/delivery-addresses/spec.md) · size L · route full · status: spec drafted

## Next

_Nothing committed yet._

## Later

Candidate outcomes are captured in `docs/local/warehouse-feature-candidates.md` and
`docs/local/warehouse-mvp-features.md`. They are feature-altitude notes rather than outcomes, and
are promoted here as they are reframed:

- Locations give a warehouse somewhere to put things. The minimal item a warehouse deals in is
  absorbed by `ordering`; Locations are not.
- Stock balances and stock movements make the warehouse's contents answerable, superseding the
  manager-maintained on-hand figure `ordering` introduces for its buffer check.
- Auditing access-management changes makes authority changes reviewable after the fact.

## Shipped

- **A person can prove who they are and stay signed in.** → [`docs/features/auth`](features/auth/spec.md)
- **Every business capability is governed by one authorization boundary.** →
  [`docs/features/access`](features/access/spec.md)
- **A warehouse manager can staff their warehouse.** →
  [`docs/features/users-management`](features/users-management/spec.md)
