// The Delivery Mode value object (sad.md §5 `purchase-drafts/domain`): the two ways a Purchase
// Draft Line's goods travel, the mode a new line starts in, and the one kind of ending each mode
// admits. Framework-independent by construction — no NestJS, HTTP or TypeORM import
// (server-architecture.md §Domain), which is also why the literals are declared here rather than
// imported from `PurchaseDraftLineEntity`: a domain value object must not import a concrete
// persistence model. They are the same strings the columns hold, and
// `delivery-mode.spec.ts` asserts the agreement in both directions so drift breaks a build.

// CONTEXT.md — Via Warehouse: the goods come to the Warehouse's own Delivery Address. Direct to
// Customer: the supplier ships them straight to a Customer's Delivery Address.
export const DeliveryMode = {
  ViaWarehouse: 'via_warehouse',
  DirectToCustomer: 'direct_to_customer',
} as const;

export type DeliveryMode = (typeof DeliveryMode)[keyof typeof DeliveryMode];

// CONTEXT.md/ADR 0002 — Arrival Confirmation: what reached the dock. Direct Delivery: what the
// customer received. The kind is a routing fact rather than a value a member submits.
export const EndingKind = {
  Arrival: 'arrival',
  DirectDelivery: 'direct_delivery',
} as const;

export type EndingKind = (typeof EndingKind)[keyof typeof EndingKind];

// AC-13/sad.md §6.7 step 2 — every new line is recorded as Via Warehouse travelling to the
// Warehouse's own Delivery Address, with no address stored on the line. Named here rather than
// repeated in each command that adds a line, and it is the value `delivery_mode` defaults to.
export const NEW_LINE_DELIVERY_MODE: DeliveryMode = DeliveryMode.ViaWarehouse;

// AC-20/`chk_purchase_draft_lines_ending_matches_mode` — the correspondence itself, as a lookup
// rather than a conditional (complexity budget: no branching to read).
const ENDING_KIND_BY_DELIVERY_MODE = {
  [DeliveryMode.ViaWarehouse]: EndingKind.Arrival,
  [DeliveryMode.DirectToCustomer]: EndingKind.DirectDelivery,
} as const satisfies Record<DeliveryMode, EndingKind>;

// The one ending a line travelling this way can have.
export const endingKindFor = (deliveryMode: DeliveryMode): EndingKind =>
  ENDING_KIND_BY_DELIVERY_MODE[deliveryMode];
