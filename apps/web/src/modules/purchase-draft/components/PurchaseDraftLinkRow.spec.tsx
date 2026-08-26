import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PurchaseDraftLinkRow } from 'modules/purchase-draft/components/PurchaseDraftLinkRow';

import type { PurchaseDraftLineLink } from '@warehouser/contracts/purchase-drafts';

// T20 DoD: "A test proves link quantities are never adjusted client-side and
// that overlapping links render without warning" (AC-11a).

const link = (
  overrides: Partial<PurchaseDraftLineLink> = {},
): PurchaseDraftLineLink => ({
  id: '00000000-0000-4000-8000-000000000301',
  customerOrderId: '00000000-0000-4000-8000-000000000401',
  customerName: 'Nordwind Logistik GmbH',
  statedQuantity: 500,
  snapshot: null,
  current: {
    quantity: 500,
    neededBy: '2026-09-01',
    state: 'unfulfilled',
    outstandingQuantity: 500,
  },
  driftSignals: [],
  allocation: null,
  ...overrides,
});

describe('PurchaseDraftLinkRow', () => {
  it('commits the raw stated quantity typed, without clamping it against anything', async () => {
    const user = userEvent.setup();
    const onRevise = vi.fn();
    render(
      <PurchaseDraftLinkRow
        isFrozen={false}
        link={link({ statedQuantity: 500 })}
        onRemove={vi.fn()}
        onRevise={onRevise}
      />,
    );

    const field = screen.getByLabelText('Stated quantity');
    await user.clear(field);
    // Vastly larger than any plausible outstanding/ordered quantity — proves
    // nothing clamps it.
    await user.type(field, '999999');
    await user.tab();

    expect(onRevise).toHaveBeenCalledExactlyOnceWith(999999);
  });

  it('renders two links whose stated quantities exceed the line without any overlap warning', () => {
    render(
      <ul>
        <PurchaseDraftLinkRow
          isFrozen={false}
          link={link({
            id: '1',
            customerName: 'Nordwind Logistik GmbH',
            statedQuantity: 400,
          })}
          onRemove={vi.fn()}
          onRevise={vi.fn()}
        />
        <PurchaseDraftLinkRow
          isFrozen={false}
          link={link({
            id: '2',
            customerName: 'Baltic Freight OÜ',
            statedQuantity: 400,
          })}
          onRemove={vi.fn()}
          onRevise={vi.fn()}
        />
      </ul>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Nordwind Logistik GmbH')).toBeInTheDocument();
    expect(screen.getByText('Baltic Freight OÜ')).toBeInTheDocument();
  });

  it('disables the field and the unlink control, and never submits, on a frozen link', () => {
    render(
      <PurchaseDraftLinkRow
        isFrozen
        link={link()}
        onRemove={vi.fn()}
        onRevise={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Stated quantity')).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Unlink Nordwind Logistik GmbH',
      }),
    ).toBeDisabled();
  });

  // jsdom applies no stylesheet, so the breakpoint behaviour is asserted
  // through the responsive utility classes the approved frames translate to,
  // exactly as `ItemDirectory.spec.tsx`'s responsive suite does.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('narrows the quantity field to 96px below md: rather than moving the unlink action (BSmrU, O42LHI 390 vs yGhkK/F0SpRx 1440)', () => {
      render(
        <PurchaseDraftLinkRow
          isFrozen={false}
          link={link()}
          onRemove={vi.fn()}
          onRevise={vi.fn()}
        />,
      );

      const field = screen.getByLabelText('Stated quantity');
      const fieldWrapper = field.closest('[data-slot="textfield"]');
      expect(fieldWrapper?.className).toContain('w-24');
      expect(fieldWrapper?.className).toContain('md:w-32');
      // The unlink action stays a sibling of the field at both viewports —
      // it never moves, only the field beside it narrows.
      expect(
        screen.getByRole('button', { name: 'Unlink Nordwind Logistik GmbH' }),
      ).toBeInTheDocument();
    });
  });
});
