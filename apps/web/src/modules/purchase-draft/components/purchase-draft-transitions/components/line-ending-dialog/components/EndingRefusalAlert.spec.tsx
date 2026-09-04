import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { describe, expect, it, vi } from 'vitest';

import { EndingRefusalAlert } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/EndingRefusalAlert';
import { renderWithProviders } from 'test/render';

import type { PurchaseDraftDetail } from '@warehouser/contracts/purchase-drafts';

// The AC-18 refusal, as the approved frame `s5EPi` writes it: the heading, that
// nothing was saved, one bullet per broken bound naming it, the closing line
// about when each bound is checked, and `Back to the form`.

const ids = {
  line: '00000000-0000-4000-8000-000000000601',
  waitingLink: '00000000-0000-4000-8000-000000000801',
  cancelledLink: '00000000-0000-4000-8000-000000000803',
};

const draft = {
  id: '00000000-0000-4000-8000-000000000501',
  reference: 'PD-0142',
  state: 'ready_for_ordering',
  expectedArrivalDate: '2026-09-01',
  lineCount: 1,
  hasDriftSignal: true,
  hasDirectToCustomerAddressDrift: false,
  closureReason: null,
  createdByUserId: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-08-01T09:00:00.000Z',
  readiedByUserId: '00000000-0000-4000-8000-000000000001',
  readiedAt: '2026-08-22T14:20:00.000Z',
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  lines: [
    {
      id: ids.line,
      itemId: '00000000-0000-4000-8000-000000000701',
      itemSku: 'WH-100420',
      itemDescription: 'Pallet wrap, 500mm',
      unitOfMeasure: 'each',
      orderedQuantity: 1200,
      packagingTypeId: 'cartons',
      valueAddingNote: null,
      receivedQuantity: null,
      ending: null,
      deliveryMode: 'via_warehouse',
      warehouseDestination: {
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes: null,
        frozen: false,
      },
      customerDestination: null,
      links: [
        {
          id: ids.waitingLink,
          customerOrderId: '00000000-0000-4000-8000-000000000901',
          customer: null,
          customerName: 'Nordwind Logistik GmbH',
          statedQuantity: 800,
          snapshot: null,
          current: {
            quantity: 1000,
            neededBy: '2026-09-02',
            state: 'unfulfilled',
            outstandingQuantity: 1000,
            lastChangedAt: null,
            deliveryAddress: null,
          },
          driftSignals: [],
          allocation: null,
        },
        {
          id: ids.cancelledLink,
          customerOrderId: '00000000-0000-4000-8000-000000000903',
          customer: null,
          customerName: 'Baltic Freight OU',
          statedQuantity: 400,
          snapshot: null,
          current: {
            quantity: 400,
            neededBy: '2026-09-12',
            state: 'cancelled',
            outstandingQuantity: 0,
            lastChangedAt: '2026-08-24T12:00:00.000Z',
            deliveryAddress: null,
          },
          driftSignals: ['cancelled'],
          allocation: null,
        },
      ],
    },
  ],
} satisfies PurchaseDraftDetail;

const renderAlert = (
  code: string | undefined,
  details?: Record<string, unknown>,
  onDismiss = vi.fn(),
): void => {
  renderWithProviders(
    <EndingRefusalAlert
      code={code}
      details={details}
      draft={draft}
      onDismiss={onDismiss}
    />,
  );
};

const BOUNDS = ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS;

const allBounds = {
  violations: [
    {
      purchaseDraftLineId: ids.line,
      rule: 'allocations_exceed_received_quantity',
      receivedQuantity: 1180,
      allocatedQuantity: 1300,
    },
    {
      purchaseDraftLineLinkId: ids.waitingLink,
      rule: 'exceeds_outstanding_quantity',
      outstandingQuantity: 1000,
      allocatedQuantity: 1100,
    },
    {
      purchaseDraftLineLinkId: ids.cancelledLink,
      rule: 'customer_order_not_unfulfilled',
      customerOrderState: 'cancelled',
      customerOrderLastChangedAt: '2026-08-24T12:00:00.000Z',
    },
  ],
};

describe('EndingRefusalAlert', () => {
  it('renders nothing while no refusal has been reported', () => {
    renderAlert(undefined);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names every bound the refusal reports, each with the figure it was measured against (AC-18)', () => {
    renderAlert(BOUNDS, allBounds);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/that assignment cannot be recorded/iu);
    expect(alert).toHaveTextContent(
      /nothing of this confirmation has been saved and the draft is untouched/iu,
    );
    expect(alert).toHaveTextContent(
      /Line 1 — you assigned 1\s300 across its customers, but recorded 1\s180 as arrived/u,
    );
    expect(alert).toHaveTextContent(
      /Nordwind Logistik GmbH — you assigned 1\s100, but they are waiting for 1\s000/u,
    );
    // `s5EPi` dates the refused order's move — "cancelled on 24 Aug" — because
    // a member holding two cancellations in mind cannot otherwise tell which
    // one refused the assignment (AC-18).
    expect(alert).toHaveTextContent(
      /Baltic Freight OU — cancelled on 24 Aug, so nothing can be assigned to it/iu,
    );
    expect(alert).toHaveTextContent(
      /each bound is checked again at the moment the confirmation is recorded, not when you started filling it in/iu,
    );
  });

  it('names an order that had already been fulfilled, and when it was', () => {
    renderAlert(BOUNDS, {
      violations: [
        {
          purchaseDraftLineLinkId: ids.waitingLink,
          rule: 'customer_order_not_unfulfilled',
          customerOrderState: 'fulfilled',
          customerOrderLastChangedAt: '2026-08-26T12:00:00.000Z',
        },
      ],
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Nordwind Logistik GmbH — already fulfilled on 26 Aug, so nothing can be assigned to it/iu,
    );
  });

  // The server reports no moment for a link it locked no Customer Order for —
  // the non-enumerating half of the same refusal. The bullet still names the
  // customer and the rule rather than trailing a date-shaped hole.
  it('names the bound without a date when the refusal carries no moment', () => {
    renderAlert(BOUNDS, {
      violations: [
        {
          purchaseDraftLineLinkId: ids.cancelledLink,
          rule: 'customer_order_not_unfulfilled',
          customerOrderState: 'cancelled',
          customerOrderLastChangedAt: null,
        },
      ],
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Baltic Freight OU — cancelled, so nothing can be assigned to it/iu,
    );
  });

  it('drops a bound whose identifier names nothing on the draft, rather than a bullet that says neither which line nor which customer', () => {
    renderAlert(BOUNDS, {
      violations: [
        {
          purchaseDraftLineLinkId: '00000000-0000-4000-8000-000000000999',
          rule: 'exceeds_outstanding_quantity',
          outstandingQuantity: 10,
          allocatedQuantity: 20,
        },
      ],
    });

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    // Nothing survived, so the sentence the three bounds share stands instead.
    expect(screen.getByRole('alert')).toHaveTextContent(
      /an assignment is more than what arrived on its line/iu,
    );
  });

  it('falls back to the shared sentence when the refusal carries no breakdown at all', () => {
    renderAlert(BOUNDS);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /an assignment is more than what arrived on its line/iu,
    );
  });

  // AC-20a (`fpRfr`) — reachable only from a stale view, because `LineEndingAction` offers no
  // second ending; that is precisely why it still needs a sentence, and why the sentence names
  // *when* rather than restating the generic refusal.
  it('names when a line ending was already recorded, without inventing bounds for it', () => {
    renderAlert(ErrorCode.PURCHASE_DRAFTS_ENDING_ALREADY_RECORDED, {
      endingKind: 'arrival',
      endingRecordedByUserId: '00000000-0000-4000-8000-000000000001',
      endingRecordedAt: '2026-09-18T10:00:00.000Z',
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      /this line's ending was already recorded on/iu,
    );
    expect(alert).not.toHaveTextContent(/that assignment cannot be recorded/iu);
    expect(
      screen.queryByRole('button', { name: /back to the form/iu }),
    ).not.toBeInTheDocument();
  });

  // AC-20 (`fssB1`) — the refusal names which of the two ways the goods travelled, which is the
  // fact the member is missing, rather than which route they happened to call.
  it.each([
    ['via_warehouse', /came to the warehouse/iu],
    ['direct_to_customer', /went straight to the customer/iu],
  ])(
    'names how the goods travelled when the ending is the wrong kind (%s)',
    (deliveryMode, sentence) => {
      renderAlert(ErrorCode.PURCHASE_DRAFTS_ENDING_MODE_MISMATCH, {
        deliveryMode,
      });

      expect(screen.getByRole('alert')).toHaveTextContent(sentence);
    },
  );

  it('states the rule of a code it does not know, never the code itself', () => {
    renderAlert('purchase_drafts.some_future_refusal');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/the ending was not recorded/iu);
    expect(alert).not.toHaveTextContent(/purchase_drafts/u);
  });

  it('hands the form back through its single control (AC-18)', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    renderAlert(BOUNDS, allBounds, onDismiss);

    await user.click(
      screen.getByRole('button', { name: /back to the form/iu }),
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
