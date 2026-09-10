import { screen } from '@testing-library/react';
import type { PurchaseDraftLineLinkIdentified } from '@warehouser/contracts/purchase-drafts';
import { EndingAssignmentRow } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/EndingAssignmentRow';
import { renderWithProviders } from 'test/render';
import { describe, expect, it, vi } from 'vitest';

// One `Assign to them` row of the 720px arrival modal (design-handoff.md
// `s5EPi`, AC-18): a link whose Customer Order has left `Unfulfilled` is drawn
// disabled, with the chip naming what moved and the caption saying how much was
// riding on it, so no assignment the boundary is certain to refuse can be typed.

const link = (
  overrides: Partial<PurchaseDraftLineLinkIdentified>,
): PurchaseDraftLineLinkIdentified => ({
  id: '00000000-0000-4000-8000-000000000801',
  customerOrderId: '00000000-0000-4000-8000-000000000901',
  customer: null,
  customerName: 'Baltic Freight OU',
  statedQuantity: 400,
  snapshot: {
    capturedDeliveryAddressId: null,
    capturedDeliveryAddressText: null,
    capturedQuantity: 400,
    capturedNeededBy: '2026-09-12',
    capturedState: 'unfulfilled',
  },
  current: {
    quantity: 400,
    neededBy: '2026-09-12',
    state: 'unfulfilled',
    outstandingQuantity: 400,
    lastChangedAt: null,
    deliveryAddress: null,
  },
  driftSignals: [],
  allocation: null,
  ...overrides,
});

const renderRow = (subject: PurchaseDraftLineLinkIdentified): void => {
  renderWithProviders(
    <ul>
      <EndingAssignmentRow
        deliveryMode="via_warehouse"
        isSubmitting={false}
        link={subject}
        onCommit={vi.fn()}
      />
    </ul>,
  );
};

const assignmentField = (): HTMLElement =>
  screen.getByLabelText(/assign to Baltic Freight OU/iu);

describe('EndingAssignmentRow', () => {
  it('offers an assignment to a customer order still waiting, with its outstanding figure grouped', () => {
    renderRow(
      link({
        current: {
          ...link({}).current,
          quantity: 1200,
          outstandingQuantity: 1200,
          lastChangedAt: null,
          deliveryAddress: null,
        },
      }),
    );

    expect(assignmentField()).toBeEnabled();
    expect(screen.getByText(/1\s200 still outstanding/u)).toBeVisible();
  });

  it('disables the assignment of a cancelled order and says what was linked for it (AC-18)', () => {
    renderRow(
      link({
        current: {
          quantity: 400,
          neededBy: '2026-09-12',
          state: 'cancelled',
          outstandingQuantity: 0,
          lastChangedAt: '2026-08-24T12:00:00.000Z',
          deliveryAddress: null,
        },
        driftSignals: ['cancelled'],
      }),
    );

    expect(assignmentField()).toBeDisabled();
    expect(assignmentField()).toHaveValue('—');
    expect(
      screen.getByText(
        /was linked for 400 · nothing can be assigned to it now/iu,
      ),
    ).toBeVisible();
    // The chip names what moved and when, never that something did (AC-16) —
    // `s5EPi` draws exactly `Cancelled on 24 Aug` on this row.
    expect(screen.getByText('Cancelled on 24 Aug')).toBeVisible();
  });

  it('disables the assignment of an order fulfilled elsewhere (AC-18)', () => {
    renderRow(
      link({
        current: {
          quantity: 400,
          neededBy: '2026-09-12',
          state: 'fulfilled',
          outstandingQuantity: 0,
          lastChangedAt: '2026-08-26T12:00:00.000Z',
          deliveryAddress: null,
        },
        driftSignals: ['became_fulfilled'],
      }),
    );

    expect(assignmentField()).toBeDisabled();
    expect(screen.getByText('Fulfilled elsewhere on 26 Aug')).toBeVisible();
  });

  it('still names the state of a link the server reported no drift for', () => {
    renderRow(
      link({
        current: {
          quantity: 400,
          neededBy: '2026-09-12',
          state: 'cancelled',
          outstandingQuantity: 0,
          lastChangedAt: null,
          deliveryAddress: null,
        },
        driftSignals: [],
      }),
    );

    expect(assignmentField()).toBeDisabled();
    expect(screen.getByText('Cancelled')).toBeVisible();
  });
});
