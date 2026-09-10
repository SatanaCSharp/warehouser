// `purchase-drafts/domain/value-objects/delivery-mode.ts` does not exist yet (T14) — this is the
// RED for the Delivery Mode value object sad.md §5 `purchase-drafts/domain` requires: the two ways
// a line's goods travel, the mode every new line starts in (AC-13), and the correspondence between
// a mode and the one kind of ending that can be recorded against it (AC-20).
//
// The value object declares its own literals rather than importing them from
// `shared/domain/entities/purchase-draft-line.entity.ts`: server-architecture.md §Domain forbids a
// domain value object importing a concrete persistence model. The two agree, and the type-level
// assignments below are what prove it — a spec may import the persistence type freely.
import {
  DeliveryMode,
  EndingKind,
  endingKindFor,
  NEW_LINE_DELIVERY_MODE,
} from 'purchase-drafts/domain/value-objects/delivery-mode.js';
import type {
  PurchaseDraftLineDeliveryMode,
  PurchaseDraftLineEndingKind,
} from 'shared/domain/entities/purchase-draft-line.entity.js';
import { describe, expect, it } from 'vitest';

describe('Delivery Mode', () => {
  // CONTEXT.md — Via Warehouse and Direct to Customer are the two ways a Purchase Draft Line's
  // goods travel, and `chk_purchase_draft_lines_delivery_mode` admits exactly these two values.
  it('names the two ways a line travels with the values the column holds', () => {
    expect(DeliveryMode.ViaWarehouse).toBe('via_warehouse');
    expect(DeliveryMode.DirectToCustomer).toBe('direct_to_customer');
  });

  // ADR 0002 — an Arrival Confirmation and a Direct Delivery are the two endings, and
  // `chk_purchase_draft_lines_ending_kind` admits exactly these two values.
  it('names the two endings with the values the column holds', () => {
    expect(EndingKind.Arrival).toBe('arrival');
    expect(EndingKind.DirectDelivery).toBe('direct_delivery');
  });

  // AC-13/sad.md §6.7 step 2 — "every new line starts as Via Warehouse travelling to the
  // Warehouse's own Delivery Address", which is the behaviour every line had before this release.
  it('starts a new line as Via Warehouse', () => {
    expect(NEW_LINE_DELIVERY_MODE).toBe(DeliveryMode.ViaWarehouse);
  });

  // AC-20/ADR 0002 — the kind of ending is a property of the way the goods travelled and never a
  // value the member submits: a Via Warehouse line ends in an Arrival Confirmation at the dock, a
  // Direct to Customer line in a Direct Delivery to the customer.
  describe('endingKindFor', () => {
    it('ends a Via Warehouse line in an Arrival Confirmation', () => {
      expect(endingKindFor(DeliveryMode.ViaWarehouse)).toBe(EndingKind.Arrival);
    });

    it('ends a Direct to Customer line in a Direct Delivery', () => {
      expect(endingKindFor(DeliveryMode.DirectToCustomer)).toBe(
        EndingKind.DirectDelivery,
      );
    });
  });

  // The domain literals and the persistence ones are the same strings, so a line read through
  // `PurchaseDraftLineEntity` flows into these predicates and the value object flows back into a
  // write without a conversion. This assignment fails to compile the moment they drift apart.
  it('agrees with the persistence column types in both directions', () => {
    const persistedMode: PurchaseDraftLineDeliveryMode =
      DeliveryMode.DirectToCustomer;
    const persistedKind: PurchaseDraftLineEndingKind = EndingKind.Arrival;
    const domainMode: DeliveryMode = 'direct_to_customer';
    const domainKind: EndingKind = 'arrival';

    expect(persistedMode).toBe(domainMode);
    expect(persistedKind).toBe(domainKind);
  });
});
