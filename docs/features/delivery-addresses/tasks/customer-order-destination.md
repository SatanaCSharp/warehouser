---
id: T12
title: 'Give a Customer Order its destination and add the redirection command'
layer: 'app'
deps: [T4, T7]
acs: ['AC-11', 'AC-11a', 'AC-11b', 'AC-11c', 'AC-12', 'AC-24']
files_hint:
  - 'apps/server/src/customer-orders/domain/'
  - 'apps/server/src/customer-orders/usecases/commands/record-customer-order.command.ts'
  - 'apps/server/src/customer-orders/usecases/commands/amend-customer-order.command.ts'
  - 'apps/server/src/customer-orders/usecases/commands/redirect-customer-order.command.ts'
  - 'apps/server/src/shared/domain/repositories/customer-order-lifecycle.repository.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T12 — Give a Customer Order its destination and add the redirection command

## Why

Demand that does not know where it is going is the gap this feature closes; and redirection is the one act that can move a destination out from under a frozen line, which is what makes Address Drift reportable at all. AC-11c is the boundary: an outstanding order moves only to another active address of the Customer it already names. Derives from [spec.md §5 AC-11…AC-12, AC-24](../spec.md) and [sad.md §6.5](../sad.md).

## What

Extend `record-customer-order` and `amend-customer-order` to accept an optional Customer and Delivery Address, defaulting to the Customer's Main one. Add `RedirectCustomerOrderCommand` as its own use case with its own rules, operating under lock through `CustomerOrderLifecycleRepository`. The existing typed `customer_name` column is kept and never rewritten.

## Definition of Done

- [ ] An order naming a Customer with no stated address records against that Customer's Main address; a stated active address is honoured.
- [ ] An order recorded by typed name records with no Customer and no Delivery Address, and **no Customer is created or matched** for it.
- [ ] Redirection moves an Unfulfilled order under lock and keeps it against the same Customer.
- [ ] Redirection is refused for an address of another Customer, an Inactive address, and a Fulfilled or cancelled order — each changing nothing.
- [ ] A Customer or address of another Warehouse is refused without disclosing it exists elsewhere.
- [ ] `DemandAllocationService` is unchanged.
- [ ] lint + vet clean.

## Precondition inherited from T4

`apps/server/src/customer-orders/domain/mappers/customer-order.mapper.ts` currently narrows a
nullable column with `entity.customerName as string`. Migration `02` dropped `NOT NULL` from
`customer_orders.customer_name`, so `CustomerOrderEntity.customerName` is `string | null`, but the
server's own boundary type `CustomerOrder` and the `@warehouser/contracts` schema behind it both
still promise a non-empty string. No write path can produce a null yet, so the cast is unreachable
today — T12 is the task that makes it reachable.

**T12 must remove that cast** in the same change that records the customer-naming shape, widening
`CustomerOrder.customerName` to `string | null` and resolving the one compile error this produces
at `apps/server/src/customer-orders/rest/controllers/customer-orders.controller.ts:41`, together
with the contract field it feeds. Verified 2026-09-03: widening the boundary type produces exactly
that one error and no other, so the change is contained to the controller and the contract.

## Notes

**Hard rule** ([spec.md §6.1](../spec.md) abuse cases): redirection reaches the order and never the frozen delivery mode or Delivery Address of any linked line. AC-11b's drift _reporting_ is T18; this task only makes the redirection that causes it.
