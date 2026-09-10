// The line condition value objects (sad.md §5 `purchase-drafts/domain`): where a refusal came from
// (AC-24, AC-25), what the Warehouse decided became of the refused goods (AC-19), and how the goods
// measured against the frozen instruction (AC-15, AC-17, AC-17a).
//
// Framework-independent by construction — no NestJS, HTTP or TypeORM import
// (server-architecture.md §Domain), which is also why the literals are declared here rather than
// imported from `PurchaseDraftLineRejectionEntity` or `PurchaseDraftLineEntity`: a domain value
// object must not import a concrete persistence model. `delivery-mode.ts` re-declares its two
// literals for the same reason, and `line-condition.spec.ts` asserts the agreement with each column
// in both directions so drift breaks a build rather than a request.
import { DeliveryMode } from 'purchase-drafts/domain/value-objects/delivery-mode.js';

// `chk_purchase_draft_line_rejections_source` — a refusal on goods that reached our own dock was
// Inspected; only directly delivered goods carry a customer's report (AC-24, AC-25).
export const RejectionSource = {
  Inspected: 'inspected',
  CustomerReported: 'customer_reported',
} as const;

export type RejectionSource =
  (typeof RejectionSource)[keyof typeof RejectionSource];

// `chk_purchase_draft_line_rejections_disposition` — what the Warehouse decided became of the
// refused goods (AC-19). The vocabulary only; "never back to Undecided" is a transition rule and
// lives in `dispositionMayBeRecorded` (AC-18a, sad.md §6.4).
export const RejectionDisposition = {
  Undecided: 'undecided',
  RefusedAtDelivery: 'refused_at_delivery',
  HeldForReturn: 'held_for_return',
  ScrappedOnSite: 'scrapped_on_site',
} as const;

export type RejectionDisposition =
  (typeof RejectionDisposition)[keyof typeof RejectionDisposition];

// AC-19 — "the system tells the member which dispositions are available", so the offered set is one
// value the refusal can carry rather than a list rebuilt at each call site. The order is the one
// openapi.yaml's `unknownDisposition` example fixes.
export const REJECTION_DISPOSITIONS = [
  RejectionDisposition.Undecided,
  RejectionDisposition.RefusedAtDelivery,
  RejectionDisposition.HeldForReturn,
  RejectionDisposition.ScrappedOnSite,
] as const satisfies readonly RejectionDisposition[];

// `chk_purchase_draft_lines_pre_receipt_conformance` — the three verdicts a Pre-receipt Conformance
// admits (AC-15). Not applicable belongs only to a line frozen carrying neither a Packaging Type nor
// a Value-adding Note (AC-17, AC-17a).
export const PreReceiptConformanceVerdict = {
  Met: 'met',
  NotMet: 'not_met',
  NotApplicable: 'not_applicable',
} as const;

export type PreReceiptConformanceVerdict =
  (typeof PreReceiptConformanceVerdict)[keyof typeof PreReceiptConformanceVerdict];

// AC-25/`chk_purchase_draft_line_rejections_source_matches_mode` — the correspondence itself, as a
// lookup rather than a conditional (complexity budget: no branching to read), exactly as
// `endingKindFor` states the ending correspondence. Stated once so AC-25 and its mirror
// (sad.md §6.2) read the same fact, and so the refusal can name the `requiredSource` openapi.yaml's
// `source_mismatch` violation carries.
const REQUIRED_SOURCE_BY_DELIVERY_MODE = {
  [DeliveryMode.ViaWarehouse]: RejectionSource.Inspected,
  [DeliveryMode.DirectToCustomer]: RejectionSource.CustomerReported,
} as const satisfies Record<DeliveryMode, RejectionSource>;

// The one Source a refusal on a line travelling this way can carry.
export const requiredSourceFor = (
  deliveryMode: DeliveryMode,
): RejectionSource => REQUIRED_SOURCE_BY_DELIVERY_MODE[deliveryMode];
