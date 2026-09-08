---
status: Draft
owner: 'Backend Lead'
reviewers: ['Tech Lead', 'Frontend Lead', 'Security Lead']
updated_at: '2026-09-07'
feature_size: 'L'
---

# API sync report — arrival-inspection

`contracts/openapi.yaml` is a **derived** artifact, not a hand-written one. It is a function of
[`data-model.md`](../data-model.md) (typed fields and constraints), the [`sad.md`](../sad.md) §6
sequence diagrams (error branches, transition guards) and [`spec.md`](../spec.md) §4/§5 (the endpoint
list and the shape of each outcome), with the §7 route table fixing the shapes. This report is the
evidence that the derivation held, and the record of where it did not.

**Gate.** `docs/features/arrival-inspection/data-model.md` is present (41 KB, dated 2026-09-07) with
two staged migrations under `migrations/` and an audit under `_audit/`. The conditional hard-refuse of
step 1 does not apply and **no fast-lane skip was taken**: every field origin below is a
`data-model.md` column or a named derivation over columns, and the staged DDL in
`migrations/01-create-arrival-inspection-schema.ts` was read as corroboration, never as a substitute.

**Interface kind.** `sad.md` frontmatter declares `target_surfaces: ['web-frontend',
'backend-service']`, **read here rather than re-derived**. `backend-service` over the REST boundary
`docs/system` establishes gives an OpenAPI 3.1 contract; `web-frontend` consumes it and produces no
contract of its own. `sad.md` §6 opens by stating the feature introduces no queue, event, scheduled
job or third-party callback; no §6 diagram carries a `<message-bus>` or `<external-system>`
participant; and §7 closes with "No queue, event, CLI, SDK or worker interface is introduced". So
**no `events.md` is written** and no operation carries an `Idempotency-Key` — both correctly absent
rather than missing.

**Depth.** `.size` reads `L` and `.route` reads `full`, so the full surface is derived: every
operation the feature adds **and** every one whose request, response or declared Permissions it
changes, with the four-shape projection modelled rather than described.

**Shape.** 6 paths, 6 operations, 1 tag, 49 schemas, 10 responses, 4 parameters. No dangling `$ref`,
no unreferenced component, no duplicate `operationId`, and no method-and-path pair served twice —
which keeps `tests/refactor/route-table.spec.mjs` green. The route-table baseline gains **two** rows
(`GET …/rejection-reasons`, `PATCH …/rejections/{rejectionId}`) and loses none, exactly as sad.md §7
predicts.

**Scope.** The document restates the two operations this feature adds and the four whose request,
response or declared Permissions it changes. Every other `ordering` and `delivery-addresses`
operation is unchanged and stays governed by
[`delivery-addresses/contracts/openapi.yaml`](../../delivery-addresses/contracts/openapi.yaml) and
[`ordering/contracts/openapi.yaml`](../../ordering/contracts/openapi.yaml). Schemas restated without
change carry an "Unchanged from …" note, the convention `delivery-addresses` set over `ordering`.

---

## Section A — field origins

Every field traces to a column, to a named derivation over columns, or to an explicit input document.
Because the contract `$ref`s every shared schema rather than inlining it, origins are recorded **per
schema** with the operations that use each named alongside — the same traceability as one row per
`(operation, field)` without repeating an identical row six times.

### `RejectionReason` — `listRejectionReasons`

| schema_path                                  | origin                                                                                                                               | confidence |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `RejectionReason.id`                         | data-model.md → `rejection_reasons.id` (PK, `VARCHAR(32)`, migration-seeded)                                                         | high       |
| `RejectionReason.label`                      | data-model.md → `rejection_reasons.label` (`VARCHAR(100)` NOT NULL, trimmed non-empty)                                               | high       |
| `RejectionReason.requiresDescription`        | data-model.md → `rejection_reasons.requires_description` (BOOLEAN NOT NULL DEFAULT false)                                            | high       |
| `RejectionReasonId` (`pattern`, `maxLength`) | data-model.md → the column's type; the **ten seeded values** come from CONTEXT.md §Glossary "Rejection Reason" and `migrations/01-…` | high       |

`created_at` / `updated_at` are deliberately **not** projected: no acceptance criterion reads when a
catalogue entry was seeded, and the catalogue is reference data whose only observable properties are
its identifier, its wording and whether it demands prose.

### `PurchaseDraftLineRejection`, `PreReceiptConformance` — the two reads

| schema_path                     | origin                                                                                                                          | confidence |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `PurchaseDraftLineRejection.id` | data-model.md → `purchase_draft_line_rejections.id` (UUID PK, app-generated)                                                    | high       |
| `…​.rejectionReasonId`          | data-model.md → `.rejection_reason_id` (FK → `rejection_reasons(id)` RESTRICT)                                                  | high       |
| `…​.rejectionReasonLabel`       | **derived on read** — joined from `rejection_reasons.label`; sound because the catalogue is extend-only (AC-23a). See Finding 3 | high       |
| `…​.quantity`                   | data-model.md → `.quantity` (INTEGER NOT NULL, `> 0`)                                                                           | high       |
| `…​.source`                     | data-model.md → `.source` (`VARCHAR(24)`, `IN ('inspected','customer_reported')`)                                               | high       |
| `…​.description`                | data-model.md → `.description` (TEXT NULL, trimmed non-empty, `char_length ≤ 1000`)                                             | high       |
| `…​.disposition`                | data-model.md → `.disposition` (NOT NULL DEFAULT `'undecided'`, four-value CHECK)                                               | high       |
| `…​.raisedByUserId`             | data-model.md → `.raised_by_user_id` (UUID NOT NULL, FK → `users(id)`)                                                          | high       |
| `…​.raisedAt`                   | data-model.md → `.created_at`, which **is** the raising time; there is no `raised_at` column                                    | high       |
| `…​.amendedByUserId`            | data-model.md → `.amended_by_user_id` (NULL, paired with `amended_at`)                                                          | high       |
| `…​.amendedAt`                  | data-model.md → `.amended_at` (timestamptz NULL)                                                                                | high       |
| `PreReceiptConformance.verdict` | data-model.md → `purchase_draft_lines.pre_receipt_conformance` (**new**, NULL, three-value CHECK)                               | high       |
| `PreReceiptConformance.note`    | data-model.md → `purchase_draft_lines.pre_receipt_conformance_note` (**new**, NULL, `char_length ≤ 1000`)                       | high       |

`purchase_draft_line_rejections.warehouse_id`, `.delivery_address`-side `.delivery_mode`,
`.updated_at` are columns with **no field**, and deliberately: the first two are carried solely to
make the composite reference provable and are already expressed by the line the Rejection hangs
under; `updated_at` is the ordinary row-touch column, which is exactly why data-model.md keeps
`amended_at` beside it — `updated_at` cannot express "this row has been amended, by someone, at a
known time".

### `LineCondition` and its two shapes — the two reads, both ending routes

| schema_path                                       | origin                                                                                                                     | confidence |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `LineConditionWithCause.acceptedQuantity`         | **derived, not a column** — `ending_quantity − COALESCE(SUM(rejections.quantity), 0)` (data-model.md § Derived quantities) | high       |
| `LineConditionWithCause.rejectedQuantity`         | **derived, not a column** — `COALESCE(SUM(rejections.quantity), 0)`                                                        | high       |
| `LineConditionWithCause.preReceiptConformance`    | the two `purchase_draft_lines` columns above                                                                               | high       |
| `LineConditionWithCause.rejections`               | `purchase_draft_line_rejections` by line, via `uq_purchase_draft_line_rejections_line_reason`                              | high       |
| `LineConditionCauseWithheld.*`                    | the same three, with `rejections` **not selected at all** (sad.md §6.3 step 3)                                             | high       |
| `PurchaseDraftLineEnding.condition` (`null` case) | `pre_receipt_conformance IS NULL` — data-model.md's stated discriminator for "this line carries no Condition Split"        | high       |

**Neither derived quantity is materialized, and that is a decision this stage inherited rather than
made.** data-model.md answers sad.md §7's question outright: a stored column is a column some future
write path can set, and `spec.md` §6.1's "Refusal as a route around the Allocation bound" stops being
structural the day it exists. The contract mirrors that by accepting neither as input anywhere.

### Request schemas — both ending routes and the amendment

| schema_path                                         | origin                                                                                            | confidence |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------- |
| `PurchaseDraftLineArrival.receivedQuantity`         | existing — `purchase_draft_lines.ending_quantity`; unchanged from `delivery-addresses`            | high       |
| `PurchaseDraftLineDirectDelivery.deliveredQuantity` | same column, differently named per ADR 0002                                                       | high       |
| `…​.rejections[]`                                   | sad.md §7 route table; each field a `purchase_draft_line_rejections` column                       | high       |
| `…​.preReceiptConformance`                          | sad.md §7 route table; both fields `purchase_draft_lines` columns                                 | high       |
| `…​.allocations[]`                                  | existing — `arrival_allocations`, unchanged from `delivery-addresses`                             | high       |
| `RejectionCreate.source`                            | data-model.md → `.source`; **an input**, which sad.md §7 contradicts itself about — see Finding 1 | high       |
| `RejectionAmend.description` / `.disposition`       | data-model.md → the only two columns the narrow conditional `UPDATE` sets                         | high       |
| `RejectionAmendment.*`                              | the same columns plus `amended_by_user_id` / `amended_at`                                         | high       |

### Fields with **no** column, recorded explicitly

| schema_path                                                                         | origin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | confidence |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `Error.details.violations[]` (`rule`, `path`, figures)                              | **derived** — sad.md §6.1 steps 5–6 require every violation collected and returned with its figures; every rule name (`quantity_out_of_range`, `description_empty`, `description_not_trimmed`, `description_too_long`, `note_empty`, `note_not_trimmed`, `note_too_long`, `note_not_admitted_by_verdict`, `condition_on_nothing_received`, plus the pre-existing Condition Split and Conformance rule names) is now settled in `openapi.yaml`'s own examples (T13, 2026-09-08 review) | high       |
| `Error.details.availableRejectionReasonIds`                                         | **derived** — AC-06 requires the refusal to name the Reasons the catalogue offers                                                                                                                                                                                                                                                                                                                                                                                                     | high       |
| `Error.details.availableDispositions`                                               | **derived** — AC-19 requires the refusal to name the Dispositions available                                                                                                                                                                                                                                                                                                                                                                                                           | high       |
| `Error.details.acceptedQuantity` / `rejectedQuantity` on `allocation_out_of_bounds` | **derived** — AC-11 requires the refusal to name the accepted and refused figures                                                                                                                                                                                                                                                                                                                                                                                                     | high       |
| `Error.details.currentDisposition`                                                  | **derived** — sad.md §6.4 step 1 needs it so the surface drops `undecided` from the menu rather than showing it disabled                                                                                                                                                                                                                                                                                                                                                              | medium     |
| `Error.details.requiredPermissionId`                                                | **derived** — AC-01a requires naming the capability; the shape `purchase_drafts.warehouse_delivery_address_required` already uses                                                                                                                                                                                                                                                                                                                                                     | high       |

The remaining `medium` row (`currentDisposition`) is declared incompleteness, not an error: no
upstream artifact fixes its shape beyond what sad.md §6.4 step 1 already requires. The violation
vocabulary row above was the other `medium` row; T13 settled it into `openapi.yaml`'s own examples,
so it is `high` as of this review (2026-09-08). No row is `low`: nothing in this contract was inferred
from a sequence message name alone.

### Operation → user story → acceptance criteria → Permissions → change class

| Operation                               | US                    | Acceptance criteria                                                                                                                                                          | Required                  | Observed                                   | Class    |
| --------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------ | -------- |
| `listRejectionReasons`                  | US-02                 | AC-06, AC-07                                                                                                                                                                 | `PURCHASE_DRAFTS:WATCH`   | —                                          | **New**  |
| `readPurchaseDraft`                     | US-08                 | AC-21, AC-22, AC-23, AC-23a, AC-26                                                                                                                                           | `PURCHASE_DRAFTS:WATCH`   | `CUSTOMERS:WATCH`, **`REJECTIONS:WATCH`**  | Extended |
| `listPurchaseDraftLines`                | US-08                 | AC-21, AC-22, AC-23, AC-23a                                                                                                                                                  | `PURCHASE_DRAFTS:WATCH`   | `CUSTOMERS:WATCH`, **`REJECTIONS:WATCH`**  | Extended |
| `recordPurchaseDraftLineArrival`        | US-01…US-06           | AC-01, AC-01a, AC-01b, AC-02, AC-03, AC-04, AC-04a, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-15a, AC-15b, AC-16, AC-17, AC-17a, AC-25 | `PURCHASE_DRAFTS:RECEIVE` | **`REJECTIONS:CREATE`**, `CUSTOMERS:WATCH` | Extended |
| `recordPurchaseDraftLineDirectDelivery` | US-09 (+ US-01…US-06) | all of the above plus AC-24, AC-25                                                                                                                                           | `PURCHASE_DRAFTS:RECEIVE` | **`REJECTIONS:CREATE`**, `CUSTOMERS:WATCH` | Extended |
| `amendPurchaseDraftLineRejection`       | US-07                 | AC-18, AC-18a, AC-18b, AC-19, AC-20, AC-26                                                                                                                                   | **`REJECTIONS:UPDATE`**   | —                                          | **New**  |

Every handler is class 2 — **Warehouse-Permission**, a `PermissionId` declared with a `warehouseId`
route parameter, resolved by `WarehouseAccessGuard` — matching sad.md §8 exactly. None is an
archived-tolerant **mutation**, so `workspaces` ADR 0003's narrow class gains no member.
`@ObservedPermission` adds no class, here as before.

---

## Section B — drift findings

### 1. Endpoint ↔ data-model — ✓ (core)

Every operation reads or writes at least one entity in `data-model.md`, and every relation the model
adds or changes is reached by at least one operation.

| Relation / column                                   | Read by                                                                                      | Written by                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `rejection_reasons`                                 | `listRejectionReasons`; both reads (label join); both ending routes (AC-06/AC-07 validation) | **nothing** — no mutation handler exists, correctly (sad.md §6.5)              |
| `purchase_draft_line_rejections`                    | both reads                                                                                   | both ending routes (insert), `amendPurchaseDraftLineRejection` (narrow update) |
| `purchase_draft_lines.pre_receipt_conformance`      | both reads                                                                                   | both ending routes                                                             |
| `purchase_draft_lines.pre_receipt_conformance_note` | both reads                                                                                   | both ending routes                                                             |
| `uq_purchase_draft_lines_id_warehouse_mode`         | —                                                                                            | — (a reference **target** only; data-model.md says so outright)                |

The catalogue having **no** write endpoint is the one asymmetry, and it is the design: members never
write it, extension is a migration, and the extend-only rule lives in the migration convention plus
sad.md §10's architecture check rather than in a runtime handler.

### 2. Error code ↔ repo error definition — ✓ with four recorded pending additions (core)

Checked against `packages/shared-types/src/enums/error-code.ts`, the repo's central `ErrorCode`
constant object.

**Present — 11 of 11 reused codes:** `purchase_drafts.invalid_input`,
`purchase_drafts.target_unavailable`, `purchase_drafts.ending_already_recorded`,
`purchase_drafts.ending_mode_mismatch`, `purchase_drafts.allocation_out_of_bounds`,
`purchase_drafts.concurrent_change`, `access.denied`, `access.membership_required`,
`access.warehouse_archived`, `access.write_rate_limited`, `system.internal_error`.

**Pending — 4 codes this feature adds**, one per distinct sad.md §6 refusal branch:

| Code                                              | Status | Branch                                                                             | ACs                               |
| ------------------------------------------------- | ------ | ---------------------------------------------------------------------------------- | --------------------------------- |
| `purchase_drafts.rejection_capability_required`   | 403    | §6.1 "the submission refuses and the resolved grants lack the refusing capability" | AC-01a                            |
| `purchase_drafts.condition_split_invalid`         | 400    | §6.1 "Condition Split violated"                                                    | AC-02, AC-06, AC-07, AC-09, AC-25 |
| `purchase_drafts.pre_receipt_conformance_invalid` | 400    | §6.1 "Pre-receipt Conformance violated"                                            | AC-16, AC-17, AC-17a              |
| `purchase_drafts.disposition_not_reversible`      | 409    | §6.4 "no row matched, the Disposition having been aimed back at undecided"         | AC-18a                            |

`tasks` owns adding these four to `ErrorCode`. **The mapping is deliberately one code per §6 branch
rather than one per AC** — the sequences collect several ACs into a single refusal, and splitting them
would break "collect every violation before refusing".

`request.invalid`, used in the `Unauthenticated` example, is **not** in the registry and is **not this
feature's**: it is carried over verbatim from `access`, `workspaces`, `ordering` and
`delivery-addresses`, which all use it for the pre-authorization refusal. Recorded here so the gap is
visible, and left where it already lives.

### 3. Validation ↔ constraint — ✓ (core)

| Contract                                                         | Constraint                                                                                                           | Verdict                                                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RejectionCreate.quantity` `integer, minimum: 1`                 | `INTEGER NOT NULL`, `chk_…_quantity_positive` (`> 0`)                                                                | ✓ exact                                                                                                                                                                                       |
| `RejectionDescription` `minLength: 1, maxLength: 1000`           | `chk_…_description_stored_trimmed` + `chk_…_description_length` (**`char_length`**, not `octet_length`)              | ✓ exact — and the character bound is why a 1 000-character Cyrillic description validates, which the negative suite proves                                                                    |
| `PreReceiptConformanceNote` `minLength: 1, maxLength: 1000`      | `chk_…_conformance_note_shape` + `…_note_length`                                                                     | ✓ exact                                                                                                                                                                                       |
| `RejectionSource` `enum`                                         | `chk_…_source` (`IN ('inspected','customer_reported')`)                                                              | ✓ exact                                                                                                                                                                                       |
| `RejectionDisposition` `enum`                                    | `chk_…_disposition` (four values)                                                                                    | ✓ exact                                                                                                                                                                                       |
| `PreReceiptConformanceVerdict` `enum`                            | `chk_purchase_draft_lines_pre_receipt_conformance` (three values)                                                    | ✓ exact                                                                                                                                                                                       |
| `RejectionReasonId` `maxLength: 32`                              | `rejection_reasons.id VARCHAR(32)`                                                                                   | ✓ exact                                                                                                                                                                                       |
| `RejectionReason.label` `maxLength: 100`                         | `rejection_reasons.label VARCHAR(100)`                                                                               | ✓ exact                                                                                                                                                                                       |
| `PurchaseDraftLineEnding.quantity` `minimum: 0`, unbounded above | `ending_quantity`, bounded neither above nor below by `ordered_quantity`                                             | ✓ exact                                                                                                                                                                                       |
| `RejectionReasonId` **not** an `enum`                            | the catalogue is data, validated by the server (sad.md §7)                                                           | ✓ deliberate — freezing ten values here would make the eleventh Reason a contract change                                                                                                      |
| `rejections` at most one per Reason                              | `uq_purchase_draft_line_rejections_line_reason`                                                                      | ✓ **not expressible** in JSON Schema; the contract states it in prose and routes it to `condition_split_invalid` (AC-09)                                                                      |
| refusals ≤ presented                                             | data-model.md § "Constraints the model deliberately does not express" — a cross-row aggregate no `CHECK` can compute | ✓ consistent — both artifacts put it in the command                                                                                                                                           |
| Source ↔ Delivery Mode                                           | `chk_…_source_matches_mode` + the composite reference                                                                | ✓ the schema is the backstop; the contract produces the **named** refusal AC-25 requires                                                                                                      |
| note only under `not_met`                                        | data-model.md explicitly **hands this rule to `api`**                                                                | ✓ **discharged** — expressed as a two-arm `oneOf` on `PreReceiptConformanceCreate`, so it is a named 400 rather than the unnamed constraint violation the server error-handling guide forbids |

No conflict was found in either direction, so the "take the stricter value" rule never fired.

### 4. OpenAPI ↔ sequence — ✓ (supporting)

Matched on flow and `alt`-branches, not on participant names.

| §6 flow | `alt` branch                                                              | Contract                                                                                           |
| ------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 6.1     | target unavailable / wrong state / ending recorded / wrong mode (AC-04)   | 404 `PurchaseDraftTargetUnavailable`, 409 `ending_already_recorded` / `ending_mode_mismatch`       |
| 6.1     | refuses without the refusing capability (AC-01a)                          | 403 `rejection_capability_required`                                                                |
| 6.1     | Condition Split violated (AC-02, 03, 06, 07, 09, 14, 25)                  | 400 `condition_split_invalid` + `invalid_input`, `details.violations[]`                            |
| 6.1     | Pre-receipt Conformance violated (AC-15b, 16, 17, 17a)                    | 400 `pre_receipt_conformance_invalid` + `invalid_input`, `details.violations[]`                    |
| 6.1     | assignment exceeds accepted / order not waiting (AC-11, 12)               | 409 `allocation_out_of_bounds` carrying the accepted and refused figures                           |
| 6.1     | nothing received (AC-04a)                                                 | 200; `receivedQuantity: 0`, `condition: null`, both judgements refused as input                    |
| 6.1     | something received; close on the last line                                | 200 `PurchaseDraftDetail`                                                                          |
| 6.2     | a refusal claims inspection on a directly delivered line (AC-25 mirrored) | 400 `condition_split_invalid`, rule `source_mismatch`                                              |
| 6.3     | draft of another Warehouse (AC-26)                                        | 404, identical to a draft that does not exist                                                      |
| 6.3     | four shapes                                                               | `PurchaseDraftLine` `oneOf` × `LineCondition` `oneOf` — the product, not four hand-written schemas |
| 6.4     | lacks the amending capability (AC-20)                                     | 403 `access.denied`                                                                                |
| 6.4     | Rejection of another Warehouse (AC-26)                                    | 404, identical to one that does not exist                                                          |
| 6.4     | a Disposition the system does not offer (AC-19)                           | 400 naming `availableDispositions`                                                                 |
| 6.4     | zero rows, aimed back at undecided (AC-18a)                               | 409 `disposition_not_reversible`                                                                   |
| 6.4     | one row matched (AC-18, AC-18b)                                           | 200 `RejectionAmendment`                                                                           |
| 6.5     | none                                                                      | 200; no mutation handler exists                                                                    |

Every `alt` branch has a response and every response traces to a branch. **§6.2's finality
acknowledgement is correctly absent from the contract** — sad.md's own flag says it is an interaction,
not a state, and no column, field, header or parameter may be inferred from it.

### Back-feed — coverage cross-check

- **Every one of the 35 acceptance criteria in `spec.md` §5 maps to at least one operation or
  response.** Verified individually; the mapping is the operation table in Section A plus point 4
  above. No AC is unreachable and none is covered only by prose.
- **Every operation maps to a §4 user story and at least one AC.** All 9 user stories are covered:
  US-01…US-06 by the two ending routes, US-07 by the amendment, US-08 by the two reads, US-09 by the
  direct-delivery route.
- **Sequence gaps found: one.** No AC and no §6 branch states what the amendment returns to an actor
  holding `REJECTIONS:UPDATE` without `REJECTIONS:WATCH` — resolved below as Finding 2 rather than
  parked, because the answer is a shape the contract cannot omit.

---

## Findings requiring your decision

Four surfaced; all four are resolved. Per the skill's threshold (≥3 flags) the run paused before
writing and each was settled with the feature owner.

### Finding 1 — `sad.md` §7 contradicts itself on the Rejection Source — **resolved: Fix the contract, and the §7 bullet is wrong**

sad.md §7's route table says the ending request "gains `rejections` (quantity, Reason identifier,
**Source**, optional description)". Three bullets below, the same section says "the Accepted Quantity,
the Rejected Quantity, **the Rejection Source**, the raising member and the time are derived or
attributed, **never accepted as input**."

Both cannot hold. The ACs decide it:

- **AC-24** — "the member records the delivery and refuses the broken units, **stating that the
  customer reported it**". The member states it.
- **AC-25** — "the member attempts to record a refusal as reported by the customer → the system
  **blocks the ending and tells the member** that a refusal on goods arriving at our own dock carries
  the inspected source". A value that cannot be expressed cannot be refused, and this refusal must
  carry a message.
- **sad.md §6.2** draws the mirrored branch explicitly: "`alt` a refusal claims inspection at our own
  dock on a directly delivered line (AC-25, mirrored) → refuse the whole submission."

So `RejectionCreate.source` is a **required** input, validated against the locked line's Delivery
Mode. Required rather than optional deliberately: an omitted Source defaulting to the legal one would
make AC-25 unreachable by a different route, and `data-model.md` has the column `NOT NULL`.

The §6.2 UI note — "the Source is derived from the line's Delivery Mode and shown as a chip, never
offered as a field, so the wrong value cannot be expressed here" — is consistent with this and was not
the source of the conflict: it is a **surface** rule about what the approved design offers, not an API
rule about what the endpoint accepts. The API must still refuse what another client can send.

**Action for `design`:** strike "the Rejection Source" from sad.md §7's derived-never-input bullet.
The other four items in that bullet (Accepted Quantity, Rejected Quantity, raising member, time) are
correct and the contract accepts none of them.

### Finding 2 — the amendment response for `REJECTIONS:UPDATE` without `REJECTIONS:WATCH` — **resolved: amendment-only echo**

No AC and no §6.4 branch covers this grant combination. AC-20 names the _converse_ (WATCH without
UPDATE), and §6.4 step 1 says the amend menu is reachable only from a row the member already sees — so
in practice the combination cannot arise through the approved surface. It can arise at the API, and
the contract must be safe there.

Returning the whole Rejection would disclose the `rejectionReasonId`, `quantity` and `source` that
spec.md §6.1's fourth quality goal gates on `REJECTIONS:WATCH`, making the amendment a second,
ungated read of exactly what the feature's security control protects.

**Resolved:** the response is `RejectionAmendment` — `{id, description, disposition, amendedByUserId,
amendedAt}` — which is literally what §6.4 step 5 says the service returns ("the amendment as
recorded, attributed to the acting member and the time"). `description` and `disposition` are returned
because the actor is the one who just set them; the Reason, quantity and Source are absent. The
negative suite proves the schema rejects a response carrying `rejectionReasonId`.

Two alternatives were considered and declined: declaring `REJECTIONS:WATCH` observed on the amendment
too (adds a fifth projection shape and a third observed declaration sad.md §7 does not list), and
returning the whole Rejection unconditionally (makes a Permission implication spec.md §6.1's table
never states).

**Consequence for the web module:** the surface refreshes the line through the RTK Query tags sad.md
§8 already connects, not from this response. That is recorded in the contract's own operation
description so a frontend engineer does not discover it during integration.

### Finding 3 — the Rejection Reason label is carried on read, unlike the Packaging Type — **resolved: carry `rejectionReasonId` **and** `rejectionReasonLabel`**

The shipped `PurchaseDraftLineIdentified` carries `packagingTypeId` alone and makes the client join
`GET …/packaging-types`. The obvious symmetry would carry `rejectionReasonId` alone.

It was declined, for a reason specific to when each catalogue is read. §6.5's precondition is "a member
**composing a refusal** needs the Reasons the catalogue offers" — so a client composing an ending has
the catalogue in hand. A member reading a **closed** draft (AC-21) is composing nothing and would
otherwise have no reason to fetch it at all, which would make AC-21's "each refused quantity beside
its reason" cost a second request that no §6 flow draws.

**AC-23a holds by construction either way**, and this is the load-bearing part: the catalogue is
extended only and no entry is ever reworded, so the current wording **is** the wording the member
stated. That is the exact opposite of the Packaging Type, which is frozen by value onto the line
_precisely because_ it can be reworded (AC-23). The two catalogues are treated differently because they
are governed by different rules, not by inconsistency — both schema descriptions say so.

### Finding 4 — "a note only under a Not met verdict" — **resolved here, as data-model.md asked**

data-model.md lists this under "Constraints the model deliberately does not express", explains that a
`CHECK` would produce an unnamed constraint violation where the server error-handling guide requires a
named predicate and a stable `ErrorCode`, and states: "The natural home is the request schema, and it
is handed to `api`."

**Discharged.** `PreReceiptConformanceCreate` is a two-arm `oneOf`: `PreReceiptConformanceNotMetCreate`
(`verdict: const not_met`, optional `note`) and `PreReceiptConformanceWithoutNoteCreate`
(`verdict: enum [met, not_applicable]`, `additionalProperties: false`, no `note` property). A note
beside `met` is therefore a schema failure naming the property, at 400 `purchase_drafts.invalid_input`
— not an unnamed constraint violation. The negative suite proves all three cases.

The note stays **optional** under `not_met`: no AC requires one, and
`chk_…_conformance_note_shape` requires only that it never stand without a verdict.

---

## Recorded consequence, not a finding — the two validation layers

sad.md §6.1's flag requires that steps 5–6 "collect before they refuse", and this contract expresses
that as `details.violations[]`. One residual remains and is named here so `tasks` does not discover it
late.

The repository validates request schemas with `z.strictObject` **before** the command runs. Zod itself
does not short-circuit — it reports every schema issue at once — but a payload failing a schema bound
(AC-03's `quantity: 0`, AC-14's over-long description) never reaches the command, so its
command-level violations (AC-02, AC-06, AC-07, AC-09, AC-25) are not reported alongside.

That is a **layer boundary, not a contract defect**: the schema bounds are `data-model.md`'s own
constraints and removing them would fail drift point 3. The fix, if the team wants a single collected
pass, belongs in the command — re-asserting the schema-expressible rules so one response can carry
both classes. `tasks` owns the decision; the contract already admits both codes on the same 400
response, so either choice is expressible without a contract change.

---

## Recorded deviations from the skill's defaults

Each is source-backed and matches the five shipped contracts in this repository.

| Default                                  | This contract                                                          | Authority                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cursor pagination on every list          | **No pagination.** Lists returned whole and deterministically ordered. | spec.md §1, sixth boundary: "the §6 targets assume the volumes `ordering` already assumes, at which every list this feature touches is returned whole rather than in pages, because this release adds no list of its own." sad.md §6.5: the catalogue "takes no Warehouse scope and is unpaged". |
| `BearerAuth` global                      | **`SessionCookie`** (`warehouser_session`, `apiKey` in cookie).        | The repository ships session-cookie authentication; all five shipped contracts declare it. No public endpoint exists here, so no operation overrides with `security: []`.                                                                                                                        |
| snake_case JSON fields                   | **camelCase.**                                                         | House style across all shipped contracts. Column names stay snake_case and are the origin recorded in Section A.                                                                                                                                                                                 |
| `{code, message, details?}` envelope     | unchanged                                                              | Matches the global filter's envelope exactly.                                                                                                                                                                                                                                                    |
| URL versioning `/api/v1/...`             | unchanged                                                              | Every route Warehouse-scoped under `/api/v1/warehouses/{warehouseId}/`.                                                                                                                                                                                                                          |
| `Idempotency-Key` on retriable mutations | **none.**                                                              | sad.md §6: the feature introduces no asynchronous work, so "every flow is a synchronous request → response and none carries an idempotency key, a retry note or a dead-letter branch".                                                                                                           |
| `contracts/events.md`                    | **absent.**                                                            | Correctly absent: no async flow, no `<message-bus>` or `<external-system>` participant, and sad.md §7's "No queue, event, CLI, SDK or worker interface is introduced".                                                                                                                           |

Four shape decisions also worth naming, since none is a skill default:

- **The four projection shapes are a product of two `oneOf`s, not four schemas.** `PurchaseDraftLine`
  `oneOf` identified/redacted (customer identity) nested with `LineCondition` `oneOf`
  with-cause/cause-withheld (refusal cause). This is what makes sad.md §6.3's "four legal shapes"
  structural: the two withholdings are independent, and four hand-written line schemas would let one
  drift from the others.
- **The cause-withheld shape omits `rejections` as a property and closes with
  `additionalProperties: false`**, so a redaction failure fails contract validation on the way out
  instead of reaching a screen — sad.md §7's requirement, applied to a second boundary. No
  `rejectionCount`, badge or placeholder exists anywhere in the document; data-model.md rejects the
  column for the same reason.
- **`RejectionReasonId` is a `pattern`-and-`maxLength` string, not an `enum`.** The catalogue is data
  extended by migration; an `enum` would make the eleventh Reason a contract change and a client
  release, which is precisely the coupling `requires_description`-as-data was chosen to avoid.
- **`RejectionDisposition` admits `undecided` in the amendment request.** AC-18a's refusal is
  conditional on the **stored** state, not the payload — the same request is legal against an
  undecided Rejection and refused against a decided one. Excluding `undecided` from the schema would
  turn a 409 with AC-18a's message into a 400 with a different one.

---

## Structural self-check

| Check                                                        | Result                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document parses as YAML, `openapi: 3.1.0`                    | ✓                                                                                                                                                                                                                                                                                        |
| Paths / operations / tags / schemas / responses / parameters | 6 / 6 / 1 / 49 / 10 / 4                                                                                                                                                                                                                                                                  |
| Duplicate `operationId`                                      | none                                                                                                                                                                                                                                                                                     |
| Duplicate method-and-path pair                               | none — `tests/refactor/route-table.spec.mjs` stays green; the baseline gains 2 rows and loses 0                                                                                                                                                                                          |
| Dangling `$ref`                                              | none                                                                                                                                                                                                                                                                                     |
| Unreferenced component (schema, response, parameter)         | none                                                                                                                                                                                                                                                                                     |
| Shared types inlined instead of `$ref`                       | none                                                                                                                                                                                                                                                                                     |
| `nullable: true` (3.0 style)                                 | none — every nullable is `type: [x, "null"]` or a `oneOf` with `type: "null"`                                                                                                                                                                                                            |
| Every operation declares 401, 403 and 500                    | ✓ 6 / 6                                                                                                                                                                                                                                                                                  |
| Every mutating operation declares 429                        | ✓ 3 / 3 — the two ending routes already declared `@WriteRateLimited()`; the amendment adds it                                                                                                                                                                                            |
| Every `example` conforms to its schema                       | ✓ **37 / 37** validated with Ajv 2020-12                                                                                                                                                                                                                                                 |
| Redaction and immutability properties                        | ✓ **28 / 28** negative assertions pass — a cause-withheld shape carrying `rejections: []` or a `rejectionCount` is rejected; the amendment request cannot reach a quantity, Reason or Source; the amendment response cannot carry a Reason; no ending payload accepts `acceptedQuantity` |
| Placeholder data only                                        | ✓ — `Test Item`, `Test Customer North`, `Test Address 1, Test City`, `PD-0143`, and `00000000-0000-4000-8000-…` identifiers. No real name, address or contact appears                                                                                                                    |
| A Rejection's cause in a denial payload, error detail or log | ✓ none — `details` carries identifiers, figures, `rule` tokens and the Reason **catalogue** (AC-06's deliberate exception), never a description or a Disposition the request did not itself submit                                                                                       |

`spectral` is not wired into this repository and `@redocly/cli` is not installed in this checkout, so
the lint above was run with the repo's own `yaml` and `ajv` and is recorded as such rather than
reported as a tool run that did not happen. Adding one of the two to the project's check target
remains open; the checks it would perform are the rows above.
