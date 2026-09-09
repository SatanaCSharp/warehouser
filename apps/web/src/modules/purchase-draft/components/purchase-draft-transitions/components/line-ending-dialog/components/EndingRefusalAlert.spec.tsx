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

  // ---------------------------------------------------------------------------------------------
  // T19 — the nine refusal codes this feature adds. Nested in its own `describe` purely to keep
  // each callback under the repository's per-function line budget; every case below still runs
  // inside `EndingRefusalAlert`'s shared `renderAlert`/`draft` fixtures above.
  describeT19RefusalCodes();
});

/**
 * T19 — the nine refusal codes this feature adds. Every one names the rule it broke and states
 * that nothing of the submission was recorded (design-handoff.md `N4IoNS`, cells `b799Xv`,
 * `KOuxb`, `MBCzx`, `Hy3k1`, `QS499`, `XJ5GY`, `aNXAl`). Each test submits **more than one**
 * violation at once, as `contracts/api-sync-report.md`'s "every violation is returned together"
 * requires — which is also what a single generic fallback message could never satisfy, since two
 * distinct bullets with two distinct figures both have to be readable at once.
 */
function describeT19RefusalCodes(): void {
  const CONDITION_SPLIT = ErrorCode.PURCHASE_DRAFTS_CONDITION_SPLIT_INVALID;
  const CONFORMANCE = ErrorCode.PURCHASE_DRAFTS_PRE_RECEIPT_CONFORMANCE_INVALID;
  const INVALID_INPUT = ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT;

  /** Renders the alert for a batch of violations under one code, and returns it. */
  const renderViolations = (
    code: string,
    violations: Record<string, unknown>[],
  ): HTMLElement => {
    renderAlert(code, { violations });
    return screen.getByRole('alert');
  };

  // The sixth condition-split rule the server can send. Without an entry in
  // `conditionSplitViolationSchema` the drop-unknown discipline swallows it and the member reads an
  // alert that explains nothing, which is what this case exists to prevent (server
  // code-review-back-end-2026-09-09.md, blocking finding 4).
  it('explains a refusal stated without a Conformance verdict, naming the refused figure', () => {
    const alert = renderViolations(CONDITION_SPLIT, [
      {
        rule: 'verdict_required_with_rejections',
        rejectionReasonId: null,
        rejectedQuantity: 8,
      },
    ]);

    expect(alert).toHaveTextContent(/8/u);
    expect(alert).toHaveTextContent(
      /judgement of the supplier's instruction/iu,
    );
  });

  it('names the over-refusal and the duplicate reason together, each in its own words (AC-02, AC-09)', () => {
    const alert = renderViolations(CONDITION_SPLIT, [
      {
        rule: 'rejections_exceed_received',
        rejectionReasonId: null,
        receivedQuantity: 100,
        rejectedQuantity: 118,
      },
      {
        rule: 'duplicate_rejection_reason',
        rejectionReasonId: 'damaged_in_transit',
      },
    ]);

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(alert).toHaveTextContent(/118/u);
    expect(alert).toHaveTextContent(/100/u);
    expect(alert).toHaveTextContent(
      /no more can be refused than was presented/iu,
    );
    expect(alert).toHaveTextContent(/damaged_in_transit/u);
    expect(alert).toHaveTextContent(/one refusal per reason/iu);
    // Neither bullet's own words are the other's — a shared fallback sentence would fail this.
    expect(alert).not.toHaveTextContent(
      /duplicate_rejection_reason bullet reads as the over-refusal one/iu,
    );
  });

  it("lists the catalogue's own reasons and names the description-requiring reason together (AC-06, AC-07)", () => {
    const alert = renderViolations(CONDITION_SPLIT, [
      {
        rule: 'unknown_rejection_reason',
        rejectionReasonId: 'damaged_by_forklift',
        availableRejectionReasonIds: [
          'damaged_by_packing',
          'damaged_in_transit',
        ],
      },
      { rule: 'description_required', rejectionReasonId: 'unfit_other' },
    ]);

    expect(alert).toHaveTextContent(/damaged_by_packing/u);
    expect(alert).toHaveTextContent(/damaged_in_transit/u);
    expect(alert).toHaveTextContent(/maintained by the team/iu);
    // AC-06's own guarantee: the team maintains it, members do not.
    expect(alert).not.toHaveTextContent(/maintained by (?:the )?members/iu);
    expect(alert).toHaveTextContent(/unfit_other/u);
    expect(alert).toHaveTextContent(
      /always (?:needs|requires) a description/iu,
    );
  });

  it('names which source that line carries when it disagrees with the delivery mode (AC-25)', () => {
    const alert = renderViolations(CONDITION_SPLIT, [
      {
        rule: 'source_mismatch',
        rejectionReasonId: 'quality_defect',
        deliveryMode: 'via_warehouse',
        submittedSource: 'customer_reported',
        requiredSource: 'inspected',
      },
    ]);

    expect(alert).toHaveTextContent(/own dock/iu);
    expect(alert).toHaveTextContent(/inspected source/iu);
    expect(alert).toHaveTextContent(/nothing.*(?:recorded|saved)/iu);
  });

  it('names the contradiction and the uninstructed line together, in different words (AC-16, AC-17a)', () => {
    const alert = renderViolations(CONFORMANCE, [
      {
        rule: 'met_contradicts_rejection',
        verdict: 'met',
        rejectionReasonId: 'packaging_not_as_instructed',
      },
      {
        rule: 'not_applicable_on_instructed_line',
        verdict: 'not_applicable',
        frozenPackagingTypeId: 'cable_coil',
        frozenValueAddingNote: true,
      },
    ]);

    expect(alert).toHaveTextContent(/contradict/iu);
    expect(alert).toHaveTextContent(/packaging_not_as_instructed/u);
    expect(alert).not.toHaveTextContent(/nothing was frozen on this line/iu);
  });

  it('names a line frozen with no instruction as the mirror case (AC-17)', () => {
    const alert = renderViolations(CONFORMANCE, [
      {
        rule: 'verdict_on_uninstructed_line',
        verdict: 'met',
        frozenPackagingTypeId: null,
        frozenValueAddingNote: false,
      },
    ]);

    expect(alert).toHaveTextContent(/nothing (?:was frozen|to judge)/iu);
    expect(alert).not.toHaveTextContent(/contradict/iu);
  });

  it('names the quantity bound and the over-long description together, each against its own field (AC-03, AC-14)', () => {
    const alert = renderViolations(INVALID_INPUT, [
      { rule: 'quantity_out_of_range', path: 'rejections.0.quantity' },
      {
        rule: 'description_too_long',
        path: 'rejections.1.description',
        maxLength: 1000,
      },
      { rule: 'description_empty', path: 'rejections.2.description' },
      { rule: 'description_not_trimmed', path: 'rejections.3.description' },
    ]);

    expect(alert).toHaveTextContent(/whole number/iu);
    expect(alert).toHaveTextContent(/at least one/iu);
    expect(alert).toHaveTextContent(
      /1[,\s]?000 characters|one thousand characters/iu,
    );
    // Three distinct description faults, not one message repeated three times.
    expect(
      alert.textContent?.match(/description/giu)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
  });

  it('names the over-long note and the nothing-received conflict together (AC-15b, AC-04a)', () => {
    const alert = renderViolations(INVALID_INPUT, [
      {
        rule: 'note_too_long',
        path: 'preReceiptConformance.note',
        maxLength: 1000,
      },
      { rule: 'note_empty', path: 'preReceiptConformance.note' },
      { rule: 'note_not_trimmed', path: 'preReceiptConformance.note' },
      { rule: 'note_not_admitted_by_verdict', verdict: 'met' },
      { rule: 'condition_on_nothing_received', path: 'preReceiptConformance' },
    ]);

    expect(alert).toHaveTextContent(
      /1[,\s]?000 characters|one thousand characters/iu,
    );
    expect(alert).toHaveTextContent(/note/iu);
    expect(alert).toHaveTextContent(/nothing.*(?:received|arrived)/iu);
  });

  // AC-11 — the assignment field that overshoots is named, not the refusal, and the shortfall is
  // stated in words rather than left for the member to subtract themselves. Bundled with AC-12's
  // already-shipped `customer_order_not_unfulfilled` bullet, exactly as design frame `aNXAl` draws
  // the two together, so a fallback covering only the shipped rule cannot pass this test.
  it('names the line whose assignment overshoots what was accepted, stating the shortfall in words, alongside the cancelled order (AC-11, AC-12)', () => {
    const alert = renderViolations(BOUNDS, [
      {
        purchaseDraftLineId: ids.line,
        rule: 'allocations_exceed_accepted_quantity',
        receivedQuantity: 100,
        rejectedQuantity: 8,
        acceptedQuantity: 92,
        allocatedQuantity: 100,
      },
      {
        purchaseDraftLineLinkId: ids.cancelledLink,
        rule: 'customer_order_not_unfulfilled',
        customerOrderState: 'cancelled',
        customerOrderLastChangedAt: '2026-08-24T12:00:00.000Z',
      },
    ]);

    expect(alert).toHaveTextContent(/Line 1/iu);
    expect(alert).toHaveTextContent(/100/u);
    expect(alert).toHaveTextContent(/8/u);
    expect(alert).toHaveTextContent(/92/u);
    expect(alert).toHaveTextContent(/only accepted goods may be assigned/iu);
    expect(alert).toHaveTextContent(
      /Baltic Freight OU — cancelled on 24 Aug, so nothing can be assigned to it/iu,
    );
  });
}
