# Backend conformance re-review — delivery-addresses (2026-09-04, run 2)

- **Work item:** `docs/features/delivery-addresses` (feature; `.size` = L, `.route` = full)
- **Skill:** `code-review-back-end`
- **Verdict:** `CHANGES REQUESTED`
- **Predecessor:** [`code-review-back-end-2026-09-04.md`](./code-review-back-end-2026-09-04.md) —
  this run measures the fixes that record's findings 1–14 asked for.
- **Companion:** [`code-review-front-end-2026-09-04.md`](./code-review-front-end-2026-09-04.md) and
  [`code-review-front-end-2026-09-04-run2.md`](./code-review-front-end-2026-09-04-run2.md) own the
  `apps/web` side of the same branch.

## Diff scope

```
git diff b0edb83..HEAD -- apps/server packages/contracts
26 files changed, 518 insertions(+), 644 deletions(-)
```

`b0edb83` is the `HEAD` the first backend review ran against; `HEAD` is `d002de9`. The surface is
the twelve commits that implemented the fixes, ten of which carry an
`SDD-Review: code-review-back-end-2026-09-04 finding <n>` trailer:

| Commit    | Prior finding |
| --------- | ------------- |
| `c14f63a` | 1             |
| `c218c72` | 11            |
| `8338d35` | 4             |
| `f226f7f` | 10            |
| `8b73c51` | 2             |
| `8f4c4bc` | 3             |
| `1266859` | 12, 13        |
| `e448681` | 5             |
| `fcb453f` | 14            |
| `cd2f5b3` | 6, 7, 8       |
| `2937362` | (observation) |
| `9d23cd7` | (observation) |

The same range changes **no** file under `apps/web` and none under `packages/contracts`, so
`code-review-front-end` does not need a third run on account of these fixes.

Everything outside this range is out of scope. Pre-existing violations in files the fixes did not
touch are recorded as observations, not findings (shared protocol §7).

## Document manifest

`docs/system/server-index.md` was read in full this run, and every document below was read in full
before dispatch.

**Floor**

- `docs/system/server-architecture.md`
- `docs/system/architecture-map.md`
- `docs/system/sad.md`
- `docs/system/adr/18-08-2026-scope-of-exercise-placement-tiebreak.md` (Accepted)
- `docs/system/adr/21-07-2026-postgresql-with-typeorm.md` (Accepted)
- `docs/system/adr/24-07-2026-server-error-handling.md` (Accepted)
- `docs/system/adr/27-07-2026-structured-logging-with-pino.md` (Accepted)
- `docs/system/adr/03-08-2026-structured-logging-instead-of-telemetry.md` (Accepted)
- `docs/system/adr/12-07-2026-schema-validation-with-zod.md` (Accepted)
- `docs/system/adr/14-08-2026-domain-owned-flat-modules.md` (**Superseded** — read for reasoning
  only; it is still the placement decision the server documents cite, which ADR 18-08 §Consequences
  records as an accepted state rather than an oversight)

**Selected by changed path**

- `docs/system/guides/adding-a-server-module.md` — the new `customers` barrel, `app.module.ts`, the
  four boundary specs, the controller mapping
- `docs/system/guides/server-use-case-boundaries.md` — two commands absorbed a service's operation;
  the timing wrapper was deleted
- `docs/system/guides/server-error-handling.md` — the predicates file was narrowed; assertions moved
- `docs/system/guides/creating-a-server-repository.md` — `repository-boundaries.spec.ts`, and the
  lock and writes that moved across the repository boundary
- `docs/system/guides/server-request-authorization.md` — three new guard-level assertions
- `AGENTS.md` (repo root) — "Coding agents must not add telemetry"

`docs/system/guides/adding-and-using-contracts.md` was in the first run's manifest and is **not** in
this one: the re-review surface adds, removes and redefines no REST request or response shape, and
touches no file under `packages/contracts`.

**Read for context, never as the rule:** `docs/features/delivery-addresses/sad.md` §5–§6,
`data-model.md`, `contracts/openapi.yaml`, `spec.md` §8, and the Accepted feature ADRs
`0001-observed-permission-redaction.md` and `0002-per-line-purchase-draft-endings.md`.

**Selector check.** `docs/system/adr/19-08-2026-declarative-permission-gates.md` remains absent from
`server-index.md` and present at `web-index.md:118`, which is correct — it governs `apps/web` gate
components. No disagreement between the index and `references/server-manifest.md` was found this
run.

## Method

Three clean-context `reviewer` workers, pinned to the reasoning tier at effort `xhigh` (`.size` = L),
split by dimension group: A+B (module ownership, layers and dependency direction), C+D (persistence,
errors, validation and contracts), E + authorization + the boundary specs. Each re-read the manifest
itself rather than taking a summary, and each was asked to state CLOSED/NOT CLOSED per prior finding
with `file:line` evidence.

Every finding below was re-verified against the code by the coordinating pass before it was carried
forward. The coordinating pass also ran the affected suites: `boundaries` 9 suites / 356 tests,
`customers|purchase-draft-line-ending` 16 suites / 179 tests, and
`pnpm --filter @warehouser/server lint` — all green.

## Findings

### Blocking

1. **[blocking] `CustomerAddressBookService` injects a repository no method body uses** —
   `apps/server/src/customers/domain/services/customer-address-book.service.ts`:231, with the value
   import at :22; rule: `docs/system/guides/server-use-case-boundaries.md` §5 "Checklist" ("Every
   constructor parameter is used by the body"), reinforced by
   `docs/system/server-architecture.md` §Services ("a shared operation that reaches a repository
   belongs in an injectable service, **so the repository is injected once** rather than threaded
   through every caller as an argument"); problem: commit `8f4c4bc` moved the last four uses of
   `this.customerAddressBookRepository` into `DeactivateCustomerDeliveryAddressCommand` and
   `SetMainCustomerDeliveryAddressCommand`, leaving the two surviving methods — `resolveCustomer`
   (:241) and `assertNameAvailable` (:260) — reaching `customerDirectoryRepository` alone; the class
   therefore declares a persistence dependency it never exercises, and the ten production files that
   inject the service pull `CustomerAddressBookRepository` in transitively. `serviceWith` in
   `customer-address-book.service.spec.ts`:313-317 still constructs it with an address-book double
   for the same reason. Nothing mechanical catches this: `private readonly` parameter properties read
   as used to ESLint, and `pnpm --filter @warehouser/server lint` is green; suggested: delete the
   `customerAddressBookRepository` constructor parameter and the value import at :22 — the `type`
   import of `DeliveryAddressWriteOutcome` at :21 is still needed by `assertCustomerWriteApplied` and
   `assertLockedDeliveryAddressWriteApplied` — and drop the address-book double from the spec helper.

### Advisory

2. **[advisory] the service's documentation still claims the writes and the lock that moved out** —
   `apps/server/src/customers/domain/services/customer-address-book.service.ts`:31-33 and :216-226;
   rule: `docs/system/server-architecture.md` §Services (the four properties that make an extraction
   legitimate — "the commands still own their operations… the service opens no transaction");
   problem: the header says the class "performs the reads those rules are decided over **and the
   writes AC-06b requires**", and the class comment lists "resolve an address that belongs to the
   Customer and is active, and reassign the Main address when the current Main one is deactivated
   (AC-06b)" plus "what makes the row lock below that command's lock" — none of which it does since
   `8f4c4bc`; a reader checking the extraction against the guide is told the service holds a write
   and a lock it does not; suggested: restate the surface as `resolveCustomer` and
   `assertNameAvailable`, drop the write and lock sentences, and keep the "stateless helpers stay
   module-level" note for the exported functions above the class.

3. **[advisory] an orphaned comment now describes the wrong predicate** —
   `apps/server/src/customers/domain/predicates/customer.predicates.ts`:39; rule:
   `docs/system/guides/server-error-handling.md` §1 "Define conditions as predicates" ("Give domain
   conditions domain names"); problem: commit `1266859` moved `customerHoldingName` out of this file
   but left its first comment line behind, so `// AC-03/AC-03c/AC-06 — the Customer of this Warehouse
that already holds the name, or \`null\`.`sits immediately above`isActiveDeliveryAddress`(:42)
and describes a symbol that is no longer in the file; suggested: delete :39, leaving the AC-06a
comment at :40-41 as the only description of`isActiveDeliveryAddress`.

4. **[advisory] the redirection handler is asserted on only one side of its observed Permission** —
   `apps/server/src/customer-orders/rest/controllers/customer-orders-http-contract.integration.spec.ts`:1174;
   rule: `docs/system/guides/server-request-authorization.md` §Verify ("for a handler declaring an
   observed Permission — the response on both sides of that Permission"); problem:
   `PUT :customerOrderId/delivery-address` declares `@ObservedPermission(CUSTOMERS_WATCH)`
   (`customer-orders.controller.ts`:188), and this diff added the archived case beside the
   Permission-denial case, but the describe's only 200 case (:1178) grants `CUSTOMERS_WATCH` and the
   other two never reach a 200 — no case drives the route as an actor without it. The disclosure risk
   is fenced one layer down: the response is built by `ReadCustomerOrderQuery`, whose redaction is
   proven on both sides at `read-customer-order.query.spec.ts`:89 and :131, which is why this is
   advisory rather than blocking; suggested: mirror the direct-delivery pair this diff introduced —
   a redirection by an actor holding `CUSTOMER_ORDERS:UPDATE` and not `CUSTOMERS:WATCH`, asserted
   against the serialized body as the neighbouring redaction cases are.

5. **[advisory] the `customers` boundary scan enforces only the module-private half of the rule** —
   `apps/server/src/customers/module-boundaries.spec.ts`:203, via `isModulePrivate` at :85 and the
   scan at :206-210; rule: `docs/system/server-architecture.md` §"Dependency direction" ("modules
   communicate through exported use-case modules, explicit services, or events, not through another
   module's controller or persistence implementation") and
   `docs/system/guides/adding-a-server-module.md` §8; problem: the new general scan flags a foreign
   target only when it is module-private, so an import of a sibling's internals that are not errors,
   predicates or DTOs — a `customer-orders/domain/services/…` file, say — is a reach outside that
   sibling's declared surface and the spec reports nothing; the sibling specs catch it with
   `isPublicSurface`/`exportedProviders` (`warehouses/module-boundaries.spec.ts`:196 and :139,
   `access/module-boundaries.spec.ts`:201 and :144). No live violation today — `customers` production
   code imports exactly one sibling specifier, `auth/auth.module`, which is legal; suggested: reuse
   the siblings' `isPublicSurface`/`exportedProviders` pair so the spec enforces both halves of the
   rule its comment at :198-202 claims to generalize.

6. **[advisory] `domain/services/purchase-draft-line-ending.service.ts` no longer contains a
   service** — `apps/server/src/purchase-drafts/domain/services/purchase-draft-line-ending.service.ts`:40;
   rule: `docs/system/server-architecture.md` §"Source structure" (`domain/services/` is the layer
   directory for services) and §Services ("Services live under the owning feature's
   `<feature-name>/domain/services/`"); problem: dropping `@Injectable` left a file whose name and
   directory both announce a service while it exports only the module-level `assertAdmitsEnding`, so
   `import { assertAdmitsEnding } from 'purchase-drafts/domain/services/purchase-draft-line-ending.service'`
   (`confirm-purchase-draft-line-arrival.command.ts`:5,
   `record-purchase-draft-line-delivery.command.ts`:5) names a collaborator that no longer exists —
   unlike `purchase-draft-assembly.service.ts`, where `assertApplied` sits beside a real
   `PurchaseDraftAssemblyService`; suggested: rename to a non-`.service.ts` home for the assertion,
   for example `purchase-drafts/domain/purchase-draft-line-ending.assertions.ts`.

7. **[advisory] two selectors are exported with no consumer outside their own file** —
   `apps/server/src/customers/domain/services/customer-address-book.service.ts`:83 and :70; rule:
   `docs/system/guides/server-error-handling.md` §1 ("Use the narrowest appropriate location… Do not
   promote a predicate for hypothetical reuse"); problem: `remainingActiveDeliveryAddresses`' only
   caller is `nextMainDeliveryAddress` at :178 in the same file, and `customerHoldingName`'s only
   production caller is `assertCustomerNameAvailable` at :113 in the same file — the export surface
   exists for `customer-address-book.service.spec.ts`, which is the shape prior finding 13 objected
   to, relocated rather than removed; suggested: drop `export` from
   `remainingActiveDeliveryAddresses`, which `nextMainDeliveryAddress`' cases at
   `customer-address-book.service.spec.ts`:175-217 already cover, and keep `customerHoldingName`
   exported only if its spec block at :221-270 adds coverage `assertNameAvailable`'s own cases do
   not.

## Prior findings — closure

Each was re-checked against the code by the coordinating pass as well as by the reviewer that owned
its dimension.

| #   | Prior finding                                    | Status                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `customers` module barrel                        | **CLOSED** — `customers/index.ts`:1 exports `CustomersModule`; `app.module.ts`:8 imports `from 'customers'`, matching `customer-orders` and `items`.                                                                                                         |
| 2   | `resolveDeliveryAddress` single caller           | **CLOSED** — inlined; `set-main-customer-delivery-address.command.ts`:60-69 reads the book and calls `assertDeliveryAddressUsable` directly.                                                                                                                 |
| 3   | `deactivateDeliveryAddress` single caller        | **CLOSED** — lock (:60-63), both assertions (:67-68) and both writes (:75-91) are inside the command's own `@Transactional()` (:47); order preserved.                                                                                                        |
| 4   | `PurchaseDraftLineEndingService` shape           | **CLOSED** — module-level `export function assertAdmitsEnding` (:40); `@Injectable`, the class and the provider registration are gone. See advisory 6.                                                                                                       |
| 5   | direct-delivery authorization assertions         | **CLOSED** — all three drive the direct-delivery route: 403 at `purchase-drafts-http-contract.integration.spec.ts`:1085, 409 archived at :1598, both sides of `CUSTOMERS:WATCH` at `purchase-draft-delivery-http-contract.integration.spec.ts`:425 and :451. |
| 6   | `warehouses` boundary module list                | **CLOSED** — derived with `readdirSync(sourceRoot)` minus `['shared','test']` (:41-46); teeth cases at :339-417 mean an empty list fails rather than passes.                                                                                                 |
| 7   | `repository-boundaries` omits `purchase-drafts`  | **CLOSED** — same derivation (:50-55); `it.each(FEATURE_MODULES)` at :96 now generates all nine cases, `purchase-drafts` included (verified in the run output).                                                                                              |
| 8   | `customers` boundary single-sibling scan         | **CLOSED for the clause it named** — general module-private scan at :203 with a discrimination case at :219; the narrower check is retained at :190. See advisory 5.                                                                                         |
| 9   | repository spec imports a feature query          | **DEFERRED** — re-resolved from "Fix now" to Defer in commit `d002de9`; recorded in `spec.md` §8 with owner + due, on the grounds that relocating the assertion first requires extracting ~200 lines of seeding into `src/test/fixtures/` for two specs.     |
| 10  | Via-Warehouse rule in the controller             | **CLOSED** — `purchase-drafts.controller.ts`:88 maps the field with no mode test; the rule lives only in `statedDestination` (`revise-purchase-draft-line.command.ts`:48-56).                                                                                |
| 11  | duplicate global + local repository registration | **CLOSED** — the three are gone from `domain.module.ts`; each remains a local provider, and both `usecase.module.di.spec.ts` graphs compile.                                                                                                                 |
| 12  | non-boolean selectors in `*.predicates.ts`       | **CLOSED** — `customer.predicates.ts` exports only `boolean`-returning functions; both selectors sit at `customer-address-book.service.ts`:70 and :83. See advisories 3 and 7.                                                                               |
| 13  | `isCustomerNameAvailable` unused                 | **CLOSED** — deleted; repo-wide grep returns no match, and the condition is reached only through `assertCustomerNameAvailable`.                                                                                                                              |
| 14  | redirect handler archived case                   | **CLOSED** — `customer-orders-http-contract.integration.spec.ts`:1252-1276 archives the Warehouse and asserts 409 `access.warehouse_archived`. See advisory 4.                                                                                               |

The first run's first observation is also closed: `shared/logger/with-operation-timing.ts` and its
spec were deleted in `2937362`, `shared/logger/` now holds only `app-logger.module.ts`, and no
reference to the helper survives in `apps/server/src`.

## Resolutions

| #   | Finding                                       | Resolution                                                                                                                   |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | unused `CustomerAddressBookRepository`        | **Fix now** — drop the constructor parameter and the value import at :22; drop the address-book double from the spec helper. |
| 2   | stale service documentation                   | **Fix now** — restate the surface as the two remaining operations; drop the write and lock sentences.                        |
| 3   | orphaned predicate comment                    | **Fix now** — delete `customer.predicates.ts`:39.                                                                            |
| 4   | redirection observed-Permission coverage      | **Fix now** — add the withheld-side redirection case, mirroring the direct-delivery pair.                                    |
| 5   | `customers` boundary scan public-surface half | **Fix now** — reuse the siblings' `isPublicSurface`/`exportedProviders`.                                                     |
| 6   | `*.service.ts` file holding no service        | **Defer** — recorded in `spec.md` §8, owner Backend Lead, due before the next per-line ending change.                        |
| 7   | selectors exported for their spec only        | **Defer** — recorded in `spec.md` §8, owner Backend Lead, due before the next `customers` address-book change.               |

No blocking finding was closed by dismissal, and no finding was dropped for lack of a citation.

## Observations — pre-existing, outside this diff

Reported for context only (shared protocol §7).

- **`users/module-boundaries.spec.ts`:19 still hand-enumerates** `FORBIDDEN_MODULES = ['access',
'auth', 'warehouses', 'workspaces']` — four of the nine modules. It was last changed in `9bc822b`,
  which predates this branch point, so it is untouched by this change. It is the same rot findings 6
  and 7 corrected elsewhere, and the last instance of it.
- **`customer-orders/module-boundaries.spec.ts`:26 still carries the single-`FORBIDDEN_SIBLING`
  shape** that finding 8 corrected in `customers`. Also untouched here.
- **The same disk-derivation is now duplicated in four specs** (`customers`, `warehouses`, `access`,
  `repository-boundaries`), each with its own `NON_MODULE_DIRECTORIES = ['shared', 'test']`. The
  duplication is not a rule violation and each copy is correct; a shared helper under `src/test/` is
  the obvious consolidation whenever a fifth appears.
- **`docs/features/delivery-addresses/sad.md`:1260 still names
  `shared/logger/with-operation-timing.ts`** as a mechanism, now that the helper is deleted. A
  feature-artifact correction, not a `docs/system` matter.
- **Predicate-placement drift between the guide and the tree** persists as recorded in the first run:
  `server-error-handling.md`:33 places a single-feature predicate at `<module-name>/predicates/`
  while the tree uses `<module-name>/domain/predicates/` throughout. Still one for `/system-docs`.

## What came back clean

Verified against a named rule over this surface, not assumed:

- **Persistence.** No repository was added or changed. No added line imports `typeorm`, a shared
  entity, `createQueryBuilder`, `getRepository`, `QueryRunner` or `DataSource.transaction` outside
  `shared/domain/{repositories,entities}`. No `@Transactional()` was added or moved onto a service or
  a repository, and the lock the deactivation takes is now reached only from the command that owns
  the transaction (`lockDeliveryAddresses` has exactly one production caller).
- **Errors.** No `try`/`catch` was introduced anywhere in the diff. Every new `assert` raises either a
  named `*Error` factory from the owning module's `domain/errors/` or an `AssertionError` string
  reserved for an invariant over rows already held under lock; the string moved byte-identical from
  the service's former private helper. No error is remapped, and the global filter is untouched.
- **Contracts and validation.** No REST request or response shape was added, removed or redefined;
  `purchase-drafts.controller.ts` still types its payloads from `@warehouser/contracts/purchase-drafts`
  through `rest/dtos/`. Zod remains the only validation technology; no `class-validator`,
  `class-transformer` or `HttpException` appears.
- **Layers.** The controller change removes a business rule rather than adding one. Both ending
  commands dropped a constructor dependency and gained no repository. No service invokes a use case,
  no use case injects `AccessCurrentUserRepository`, and no `with*` wrapper, interceptor or
  base-class template was introduced.
- **Module ownership.** The new barrel exports exactly the module that exists and is required by the
  runtime, matching `customer-orders/index.ts` and `items/index.ts`. No module was created, nested or
  moved; no empty layer directory was added.
- **Logging, measurement and async work.** No `console.*` in production code, no logger touched, no
  timing, duration, counter, span or exporter in the 544 added lines, and no BullMQ or Redis
  anticipation. The one removal in this area deletes a standing violation.
- **Testing.** Every DB-touching case added carries the `*.integration.spec.ts` suffix. The relocated
  service-spec blocks landed in the command specs rather than being dropped, and the rule-level cases
  stayed with the pure functions. No spec added here opens a second `QueryRunner`, polls
  `pg_stat_activity`, races two writers, or asserts latency or throughput. The boundary scans are
  demonstrably non-vacuous: all nine modules generate cases at run time.

## Next

`CHANGES REQUESTED` → `/implement delivery-addresses` for findings 1–5 (no `/clear` — stay in
context), then re-run `/code-review-back-end delivery-addresses` over the changed surface.

After it passes, `/review delivery-addresses` runs the independent acceptance-criteria pass. The
front-end review does not need a third run unless the fixes move `apps/web` or the web side of
`packages/contracts` — these five do not.
