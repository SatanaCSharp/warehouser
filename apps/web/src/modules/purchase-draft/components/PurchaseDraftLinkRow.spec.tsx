import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PurchaseDraftLinkRow } from 'modules/purchase-draft/components/PurchaseDraftLinkRow';

import type { PurchaseDraftLineLink } from '@warehouser/contracts/purchase-drafts';
import type { PurchaseDraftLinkRowField } from 'modules/purchase-draft/components/PurchaseDraftLinkRow';

// T20 DoD: "A test proves link quantities are never adjusted client-side and
// that overlapping links render without warning" (AC-11a).
// T21 extends the row to its third job, the arrival assignment row (`BSmrU`):
// the same claim holds there, where the bounds are the server's (AC-18).
//
// The trailing control is the caller's — the line editor's unlink button, or
// an assignment's outstanding figure — so it is asserted where it is rendered
// (`PurchaseDraftLineEditor.spec.tsx`), not here.

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
    lastChangedAt: null,
  },
  driftSignals: [],
  allocation: null,
  ...overrides,
});

/** The row's first job: a draft-line link, committing once typing has finished. */
const statedQuantityField = (
  overrides: Partial<PurchaseDraftLinkRowField> = {},
): PurchaseDraftLinkRowField => ({
  commitOn: 'blur',
  description:
    'Coverage is a note, not a claim — it is never adjusted for you.',
  isDisabled: false,
  label: 'Stated quantity',
  value: '500',
  onCommit: vi.fn(),
  ...overrides,
});

describe('PurchaseDraftLinkRow', () => {
  it('commits the raw stated quantity typed, without clamping it against anything', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PurchaseDraftLinkRow
        isFrozen={false}
        link={link({ statedQuantity: 500 })}
        field={statedQuantityField({ onCommit })}
        trailing={null}
      />,
    );

    const field = screen.getByLabelText('Stated quantity');
    await user.clear(field);
    // Vastly larger than any plausible outstanding/ordered quantity — proves
    // nothing clamps it.
    await user.type(field, '999999');
    await user.tab();

    expect(onCommit).toHaveBeenCalledExactlyOnceWith(999999);
  });

  it('reports an assignment as it is typed, still without clamping it (AC-18)', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PurchaseDraftLinkRow
        isFrozen={false}
        link={link({ current: { ...link().current, outstandingQuantity: 10 } })}
        field={statedQuantityField({
          commitOn: 'change',
          description: undefined,
          label: 'For Nordwind Logistik GmbH',
          value: '',
          onCommit,
        })}
        trailing={<span>10 still outstanding</span>}
      />,
    );

    // Far beyond what this customer is still waiting for: the row reports it
    // unchanged, because the bound is the server's to re-check.
    await user.type(screen.getByLabelText('For Nordwind Logistik GmbH'), '900');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onCommit).toHaveBeenLastCalledWith(900);
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
          field={statedQuantityField({ value: '400' })}
          trailing={null}
        />
        <PurchaseDraftLinkRow
          isFrozen={false}
          link={link({
            id: '2',
            customerName: 'Baltic Freight OÜ',
            statedQuantity: 400,
          })}
          field={statedQuantityField({ value: '400' })}
          trailing={null}
        />
      </ul>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Nordwind Logistik GmbH')).toBeInTheDocument();
    expect(screen.getByText('Baltic Freight OÜ')).toBeInTheDocument();
  });

  it('disables the field, and never commits, on a frozen link', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    render(
      <PurchaseDraftLinkRow
        isFrozen={false}
        link={link()}
        field={statedQuantityField({ isDisabled: true, onCommit })}
        trailing={null}
      />,
    );

    const field = screen.getByLabelText('Stated quantity');
    expect(field).toBeDisabled();

    await user.type(field, '7');
    await user.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('states the customer\u2019s live demand on an unfrozen link', () => {
    render(
      <PurchaseDraftLinkRow
        isFrozen={false}
        link={link()}
        field={statedQuantityField()}
        trailing={null}
      />,
    );

    expect(
      screen.getByText(
        'Unfulfilled \u00b7 500 outstanding \u00b7 needed by 1 Sep 2026',
      ),
    ).toBeInTheDocument();
  });

  // AC-16 \u2014 a frozen row reads the Demand Snapshot captured at the freeze, and
  // its chip names the value that moved rather than reporting that one did.
  it('reads the snapshot on a frozen link and names what moved', () => {
    render(
      <PurchaseDraftLinkRow
        isFrozen
        link={link({
          snapshot: {
            capturedQuantity: 800,
            capturedNeededBy: '2026-09-02',
            capturedState: 'unfulfilled',
          },
          current: {
            quantity: 1000,
            neededBy: '2026-09-02',
            state: 'unfulfilled',
            outstandingQuantity: 1000,
            lastChangedAt: '2026-08-25T12:00:00.000Z',
          },
          driftSignals: ['quantity_changed'],
        })}
        field={statedQuantityField()}
        trailing={null}
      />,
    );

    expect(
      screen.getByText(
        'Unfulfilled \u00b7 was 800 outstanding, needed by 2 Sep 2026',
      ),
    ).toBeInTheDocument();
    // Testing Library's default normalizer collapses the no-break space the
    // quantity formatter groups thousands with, so the query uses a plain one.
    // The chip is dated as the frame draws it — the comparison AC-16 asks for
    // is what moved *and when* (`F0SpRx`).
    expect(screen.getByText('Raised to 1 000 on 25 Aug')).toBeInTheDocument();
  });

  it('says the state itself is what moved when the order was cancelled', () => {
    render(
      <PurchaseDraftLinkRow
        isFrozen
        link={link({
          snapshot: {
            capturedQuantity: 440,
            capturedNeededBy: '2026-09-09',
            capturedState: 'unfulfilled',
          },
          current: {
            quantity: 440,
            neededBy: '2026-09-09',
            state: 'cancelled',
            outstandingQuantity: 0,
            lastChangedAt: '2026-08-24T12:00:00.000Z',
          },
          driftSignals: ['cancelled'],
        })}
        field={statedQuantityField()}
        trailing={null}
      />,
    );

    expect(
      screen.getByText(
        'Was Unfulfilled \u00b7 440 outstanding, needed by 9 Sep 2026',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Cancelled on 24 Aug')).toBeInTheDocument();
  });

  // jsdom applies no stylesheet, so the breakpoint behaviour is asserted
  // through the responsive utility classes the approved frames translate to,
  // exactly as `ItemDirectory.spec.tsx`'s responsive suite does.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('narrows the quantity field to 96px below md: rather than moving the trailing action (BSmrU, O42LHI 390 vs yGhkK/F0SpRx 1440)', () => {
      render(
        <PurchaseDraftLinkRow
          isFrozen={false}
          link={link()}
          field={statedQuantityField()}
          trailing={
            <button type="button">Unlink Nordwind Logistik GmbH</button>
          }
        />,
      );

      const field = screen.getByLabelText('Stated quantity');
      const fieldWrapper = field.closest('[data-slot="textfield"]');
      expect(fieldWrapper?.className).toContain('w-24');
      expect(fieldWrapper?.className).toContain('md:w-32');
      // The trailing action stays a sibling of the field at both viewports —
      // it never moves, only the field beside it narrows.
      expect(
        screen.getByRole('button', { name: 'Unlink Nordwind Logistik GmbH' }),
      ).toBeInTheDocument();
    });
  });
});
