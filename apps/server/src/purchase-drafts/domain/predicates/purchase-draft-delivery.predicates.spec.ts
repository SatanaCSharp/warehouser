// `purchase-drafts/domain/predicates/purchase-draft-delivery.predicates.ts` does not exist yet
// (T14) — this is the RED for the pure predicates behind a line's destination, its ending and the
// draft's closure (server-error-handling.md §1: "Receive all required values as arguments",
// "Return `boolean`", "Do not mutate state, perform I/O, log, or throw"). Each is asserted with a
// named error factory by the command that owns the write; this spec proves the condition alone.
import { isDraftMutable } from 'purchase-drafts/domain/predicates/purchase-draft-assembly.predicates.js';
import {
  directLineNamesACustomerAddress,
  endingMatchesDeliveryMode,
  hasEndingRecorded,
} from 'purchase-drafts/domain/predicates/purchase-draft-delivery.predicates.js';
import {
  DeliveryMode,
  EndingKind,
} from 'purchase-drafts/domain/value-objects/delivery-mode.js';
import { describe, expect, it } from 'vitest';

const AN_ADDRESS_ID = '00000000-0000-4000-8000-000000000301';
const AN_ENDING_TIME = new Date('2026-09-18T10:00:00.000Z');

describe('purchase-draft delivery predicates', () => {
  // AC-14 — "goods shipped to their own site are travelling Via Warehouse, so a Direct to Customer
  // line names a customer's address". The Warehouse's own Delivery Address is columns on
  // `warehouses` and has no identifier `customer_delivery_address_id` could hold (data-model.md
  // §`purchase_draft_lines`), so the only way to state "direct to customer, going to my own site"
  // is to name no Customer Delivery Address at all — and that submitted intent is what this
  // refuses. It is not a check on the address text and invents no identifier for the Warehouse's
  // address.
  describe('directLineNamesACustomerAddress', () => {
    it('is false for a Direct to Customer line naming no Customer Delivery Address, which is the Warehouse’s own', () => {
      expect(
        directLineNamesACustomerAddress(DeliveryMode.DirectToCustomer, null),
      ).toBe(false);
    });

    it('is true for a Direct to Customer line naming a Customer Delivery Address', () => {
      expect(
        directLineNamesACustomerAddress(
          DeliveryMode.DirectToCustomer,
          AN_ADDRESS_ID,
        ),
      ).toBe(true);
    });

    // AC-13 — a Via Warehouse line's destination *is* the Warehouse's, so naming no address is the
    // whole point of the mode and this rule never refuses it. Whether such a line may also carry an
    // address is `chk_purchase_draft_lines_delivery_mode_address`, a schema fact rather than a rule
    // a command remembers (data-model.md).
    it('never refuses a Via Warehouse line, whose destination is the Warehouse’s own', () => {
      expect(
        directLineNamesACustomerAddress(DeliveryMode.ViaWarehouse, null),
      ).toBe(true);
    });
  });

  // AC-20 — "the member attempts to record an arrival at the warehouse against a Direct to
  // Customer line, or a delivery to the customer against a Via Warehouse line": both directions
  // are refused, and the rule is `chk_purchase_draft_lines_ending_matches_mode` stated in the
  // domain.
  describe('endingMatchesDeliveryMode', () => {
    it('accepts an Arrival Confirmation against a Via Warehouse line', () => {
      expect(
        endingMatchesDeliveryMode(
          DeliveryMode.ViaWarehouse,
          EndingKind.Arrival,
        ),
      ).toBe(true);
    });

    it('accepts a Direct Delivery against a Direct to Customer line', () => {
      expect(
        endingMatchesDeliveryMode(
          DeliveryMode.DirectToCustomer,
          EndingKind.DirectDelivery,
        ),
      ).toBe(true);
    });

    it('refuses an Arrival Confirmation against a Direct to Customer line', () => {
      expect(
        endingMatchesDeliveryMode(
          DeliveryMode.DirectToCustomer,
          EndingKind.Arrival,
        ),
      ).toBe(false);
    });

    it('refuses a Direct Delivery against a Via Warehouse line', () => {
      expect(
        endingMatchesDeliveryMode(
          DeliveryMode.ViaWarehouse,
          EndingKind.DirectDelivery,
        ),
      ).toBe(false);
    });
  });

  // AC-20a — a line's ending is recorded at most once. The four ending columns "arrive together or
  // not at all" (`chk_purchase_draft_lines_ending_attribution`), so the recorded time alone decides
  // whether there is an ending — including for a line where nothing arrived, whose quantity is `0`
  // and not `null`.
  describe('hasEndingRecorded', () => {
    it('is false for a line whose ending has not been recorded', () => {
      expect(hasEndingRecorded(null)).toBe(false);
    });

    it('is true once an ending has been recorded against the line', () => {
      expect(hasEndingRecorded(AN_ENDING_TIME)).toBe(true);
    });
  });

  // AC-17 — "a draft is frozen once it is ready": a change to a line's delivery mode or Delivery
  // Address is refused for every member, the one who created the draft and the Warehouse Manager
  // alike. The condition is the draft's state and nothing about the member, and the refusal is the
  // shipped `purchaseDraftFrozenError`; the write itself resolves only `draft`-state drafts, so
  // this predicate never becomes a check a concurrent freeze can race (sad.md §6.7 step 6).
  describe('the frozen draft (AC-17)', () => {
    it('admits a delivery-mode or Delivery Address change only while the draft is in the draft state', () => {
      expect(isDraftMutable('draft')).toBe(true);
      expect(isDraftMutable('ready_for_ordering')).toBe(false);
      expect(isDraftMutable('closed')).toBe(false);
      expect(isDraftMutable('discarded')).toBe(false);
    });
  });
});
