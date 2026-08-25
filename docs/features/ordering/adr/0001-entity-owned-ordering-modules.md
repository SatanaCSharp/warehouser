---
status: Accepted
owner: 'Tech Lead'
reviewers: ['Backend Lead', 'Frontend Lead']
updated_at: '2026-08-25'
feature_size: 'XL'
ticket: ''
---

# 0001 — Three entity-owned modules per side, not one `ordering` module

## Context

The `ordering` release introduces the first business data the product holds: the Item, the Customer
Order and the Purchase Draft ([`spec.md`](../spec.md) §1). Every existing server module — `auth`,
`users`, `access`, `warehouses`, `workspaces` — owns access or ownership data, so there is no
precedent for where business entities of one Warehouse go.

[Domain-owned flat modules](../../../system/adr/14-08-2026-domain-owned-flat-modules.md) says a
module is named for the entity whose invariants it enforces, that one entity owns exactly one
top-level module, and that modules never nest. [Adding a server
module](../../../system/guides/adding-a-server-module.md) §1 allows the alternative reading: a
module may instead be named for "a cohesive business capability", and it explicitly warns against
"splitting one capability across two modules by the scope that invokes it".

Both readings are live here, because the three entities are not independent. Three of the feature's
most important behaviours cross entity lines: the consolidated demand reads Customer Orders, Items
and Purchase Draft links together (AC-04, AC-20); the Drift Signal compares a draft's Demand Snapshot
against current Customer Orders (AC-16); and Arrival Confirmation writes to a draft and to the
Customer Orders it links to in one atomic outcome (AC-17, §6 "Arrival atomicity").

The decision is load-bearing beyond this release. [ADR
18-08](../../../system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md) records that "future
in-Warehouse entities do not grow inside" `modules/warehouse` and become "flat top-level sibling
modules", and the roadmap parks Locations, Stock balances and Stock Movements behind this release —
each of which will face the same question and will cite whatever is decided here.

## Decision drivers

- The invariant sets are genuinely separate: SKU uniqueness and activation; Outstanding Quantity, the
  needed-by date and the Fulfilled transition; the freeze, the at-least-one-line rule and close-once.
- A module boundary must mean something. ADR 18-08 rejects a boundary "whose only purpose is to let a
  module reach material that nothing else could use".
- Cross-entity **reads** are already provided for: a specialized shared repository is explicitly
  shaped around a cohesive persistence operation that "may operate on several entities"
  ([creating a server repository](../../../system/guides/creating-a-server-repository.md)).
- Cross-entity **writes** are the real cost, and there is exactly one of them.
- The sixteen Permissions in `spec.md` §6.1 already partition three ways — `ITEMS:*` and
  `ITEM_STOCK:*`, `CUSTOMER_ORDERS:*`, `PURCHASE_DRAFTS:*` — which is the specification's own view of
  where the subjects divide.
- Whatever is chosen will be cited by Locations, Stock balances and Stock Movements.

## Considered options

- **A — One `ordering` module** owning Items, Customer Orders and Purchase Drafts. Every seam becomes
  internal; nothing crosses a boundary.
- **B — Two modules: `items` and `ordering`** (Customer Orders plus Purchase Drafts). The Item
  catalogue is clearly self-contained; the demand↔draft seams stay internal.
- **C — Three modules: `items`, `customer-orders`, `purchase-drafts`**, with cross-entity reads served
  by specialized shared repositories and the one cross-entity write delegated through an exported
  service ([ADR 0002](./0002-arrival-confirmation-ownership.md)).

## Decision outcome

Chosen: **C — three entity-owned modules per side.**

On the server: `apps/server/src/items`, `customer-orders`, `purchase-drafts`, flat siblings of the
existing five. On the web: `modules/item`, `modules/customer-order`, `modules/purchase-draft`, flat
siblings under the existing Warehouse layout.

The reasoning is that the seams are asymmetric and the asymmetry decides it. Of the six places the
three entities meet — the demand read, Coverage, the Drift Signal, link validation, the
amend-below-allocated floor, and Arrival Confirmation — five are **reads**, and a read across
entities is precisely what `docs/system` tells us to express as one purpose-built query in a
specialized shared repository. Those repositories know persistence entities only and import no
feature module, so five of six seams cost nothing in coupling. Only Arrival Confirmation is a write,
and ADR 0002 resolves it with the mechanism the server architecture already names for cross-module
communication: an explicit exported service, inside one propagated transaction.

Option A was rejected because it dissolves three distinct invariant sets into one module and buys
only the removal of a seam that ADR 0002 handles for the price of one injected service. Option B was
rejected for the same reason applied once: the Customer Order's lifecycle is exercised entirely
without drafts — record, amend, cancel, consolidate — and a Purchase Draft is assembled, frozen and
closed without touching Customer Order invariants except at arrival. Neither option's merged module
would have a name that describes what it enforces, which is the test ADR 14-08 sets.

## Consequences

### Positive

- Each module's name states what it enforces, so a contributor looking for "where a Customer Order is
  amended" finds `customer-orders`, and the review question "does this belong here" has an answer.
- Locations, Stock balances and Stock Movements inherit a worked precedent rather than reopening this.
- Three smaller contract subpaths, three smaller web modules, and a `tasks` order that can land Items
  first, then demand, then drafts — each against something that already exists.
- The Permission vocabulary, the module list and the contract subpaths partition the same three ways,
  so a missing Permission or a misplaced endpoint is visible by inspection.

### Negative

- One cross-module dependency edge exists: `purchase-drafts` → `customer-orders`. It must stay
  one-directional, which an architecture check asserts (`sad.md` §10). `customer-orders` reads draft
  link rows for Coverage **through a shared repository**, never by importing `purchase-drafts`.
- Two shared repositories read rows belonging to more than one module. This is prescribed, but it does
  mean the persistence layer sees a wider join than any single module does, and a reviewer must read
  the repository rather than the module to understand the demand read.
- Three modules land in one release, which is a larger review surface than one would be.

### Neutral

- Six new directories on the server and three on the web. The module list grows from five to eight and
  from five to eight respectively; both stay flat.
- URL layout is unaffected: `@Controller` prefixes are declared independently of source location, so
  the three modules serve routes under one `api/v1/warehouses/{warehouseId}` prefix without either
  layout constraining the other.

## Links

- [`sad.md`](../sad.md) §4, §5, §8
- [ADR 0002 — Arrival Confirmation ownership](./0002-arrival-confirmation-ownership.md)
- [Domain-owned flat modules](../../../system/adr/14-08-2026-domain-owned-flat-modules.md)
- [Scope-of-exercise placement tiebreak](../../../system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md)
- [Adding a server module](../../../system/guides/adding-a-server-module.md)
- [Creating a server repository](../../../system/guides/creating-a-server-repository.md)
