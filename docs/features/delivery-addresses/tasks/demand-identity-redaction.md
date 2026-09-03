---
id: T13
title: 'Redact customer identity in the demand and Customer Order projections and serve their REST surface'
layer: 'ports'
deps: [T5, T12]
acs: ['AC-09a', 'AC-11', 'AC-11a', 'AC-11b', 'AC-11c', 'AC-24']
files_hint:
  - 'apps/server/src/customer-orders/usecases/queries/'
  - 'apps/server/src/customer-orders/rest/'
  - 'apps/server/src/shared/domain/repositories/consolidated-demand.repository.ts'
  - 'packages/contracts/src/customer-orders/'
  - 'tests/refactor/route-table.baseline.json'
owner: 'Security Lead'
estimate: 'L'
status: 'todo'
---

# T13 — Redact customer identity in the demand and Customer Order projections and serve their REST surface

## Why

[sad.md §11](../sad.md) names retrofitting the shipped surfaces under a Permission they never declared as "the largest and least visible part of this feature — a missed surface leaks silently and forever". Redaction is a property of the **projection**: the withheld value is never selected into the response. Derives from [spec.md §5 AC-09a](../spec.md) and [ADR 0001](../adr/0001-observed-permission-redaction.md).

## What

Build the redacted and full forms of the consolidated-demand and Customer Order projections from `observedPermissionIds`, and serve the demand, Customer Order list, amendment and redirection endpoints with `@ObservedPermission(CUSTOMERS:WATCH)` declared. Extend the `customer-orders` contracts subpath so the redacted form **omits** the fields rather than nulling them.

## Definition of Done

- [ ] One redaction unit test per projection, on both sides of `CUSTOMERS:WATCH`.
- [ ] Withheld means the field is **absent**, so a redaction failure is a contract violation rather than a rendering artefact.
- [ ] A name typed onto an order that names no Customer is withheld exactly as a Customer's name is.
- [ ] No count survives redaction anywhere in the response.
- [ ] Everything the member's own Permissions do admit is unchanged — asserted, not assumed.
- [ ] Both the redacted and the unredacted shape validate against the contract.
- [ ] lint + vet clean.

## Precondition inherited from T12

`packages/contracts/src/customer-orders/customer-orders-projections.ts` still declares
`customerName: z.string().min(1)`, but a Customer Order that names a Customer carries **no** typed
name — it reads the name live, which is what makes AC-03b true by construction. T12 therefore left
an assertion in `customer-orders/rest/controllers/customer-orders.controller.ts`:

```ts
assert(order.customerName !== null, '...');
```

It is honest rather than a type lie — an `AssertionError` the global filter reports as a defect —
and it is currently unreachable, because `customerOrderCreateSchema` carries no `customerId`, so no
request this controller serves can create a Customer-naming row. **T13 makes it reachable, and must
remove it.**

**Measured blast radius, 2026-09-03.** Changing that field to `.nullable()` and rebuilding contracts
produces **zero** server type errors — the assertion can simply be deleted — and **four** web errors,
all on the demand surface:

- `apps/web/src/modules/customer-order/components/demand-directory/components/DemandTable.tsx` (98, 99)
- `apps/web/src/modules/customer-order/components/demand-directory/DemandDirectory.tsx` (108, 118)

Those four are not mechanical: they decide what the demand surface _renders_ for an order that names
a Customer, which AC-24 answers — such rows show the Customer with the Delivery Address it is going
to, while typed-name rows show the name and no address. That is **T22's** work.

So the contract change is compile-coupled with the web display: landing it alone leaves
`pnpm --filter @warehouser/web build` broken until T22. Either land T13's contract change together
with those four web call sites as one compile-coupled commit (the sanctioned exception in the
implement skill), or keep the contract non-null until T22's lane and carry the assertion until then.
Decide deliberately rather than discovering it at the gate.

## Notes

The mechanical check that this was done for **every** identity-bearing surface rather than the remembered ones is T20; this task lands the mechanism, T20 proves the coverage. Shares the route-table baseline lane.
