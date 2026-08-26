import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { PurchaseDraftDetailPane } from 'modules/purchase-draft/components/PurchaseDraftDetailPane';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type { PurchaseDraftDetail } from '@warehouser/contracts/purchase-drafts';
import type { AppStore } from 'store';

// T20 DoD:
// - "A test proves draft state renders through a total Record<State,
//   ReactElement> lookup, never an if/else if chain".
// - "A test proves the Drift Signal is icon plus text and never colour
//   alone, and that a card without drift is visibly distinguished from one
//   with it" (AC-16, AC-16a) — covered here for the aggregate alert; the
//   per-signal unit itself is `DriftSignal.spec.tsx`.

const seedPackagingTypes = (store: AppStore): void => {
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'listPackagingTypes',
      accessIds.warehouse,
      [{ id: 'cartons', label: 'Cartons' }],
    ),
  );
};

const draft = (
  overrides: Partial<PurchaseDraftDetail> = {},
): PurchaseDraftDetail => ({
  id: '00000000-0000-4000-8000-000000000501',
  state: 'draft',
  expectedArrivalDate: null,
  lineCount: 1,
  hasDriftSignal: false,
  closureReason: null,
  createdByUserId: accessIds.actingUser,
  createdAt: '2026-08-01T09:00:00.000Z',
  readiedByUserId: null,
  readiedAt: null,
  closedByUserId: null,
  closedAt: null,
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  lines: [
    {
      id: '00000000-0000-4000-8000-000000000601',
      itemId: '00000000-0000-4000-8000-000000000701',
      itemSku: 'WH-100420',
      itemDescription: 'Pallet wrap, 500mm',
      unitOfMeasure: 'each',
      orderedQuantity: 400,
      packagingTypeId: 'cartons',
      valueAddingNote: null,
      receivedQuantity: null,
      links: [],
    },
  ],
  ...overrides,
});

const render = (detail: PurchaseDraftDetail): AppStore => {
  const store = authenticatedStore();
  seedPackagingTypes(store);
  renderInEnteredWarehouse(<PurchaseDraftDetailPane draft={detail} />, store);
  return store;
};

describe('PurchaseDraftDetailPane', () => {
  it('renders an editable line for a draft in the Draft state', async () => {
    render(draft({ state: 'draft' }));

    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordered quantity')).toBeEnabled();
  });

  it('renders frozen lines and the aggregate Drift Signal for Ready for ordering', async () => {
    render(
      draft({
        state: 'ready_for_ordering',
        hasDriftSignal: true,
        lines: [
          {
            id: '00000000-0000-4000-8000-000000000601',
            itemId: '00000000-0000-4000-8000-000000000701',
            itemSku: 'WH-100420',
            itemDescription: 'Pallet wrap, 500mm',
            unitOfMeasure: 'each',
            orderedQuantity: 400,
            packagingTypeId: 'cartons',
            valueAddingNote: null,
            receivedQuantity: null,
            links: [
              {
                id: '00000000-0000-4000-8000-000000000801',
                customerOrderId: '00000000-0000-4000-8000-000000000901',
                customerName: 'Nordwind Logistik GmbH',
                statedQuantity: 400,
                snapshot: {
                  capturedQuantity: 400,
                  capturedNeededBy: '2026-09-01',
                  capturedState: 'unfulfilled',
                },
                current: {
                  quantity: 350,
                  neededBy: '2026-09-01',
                  state: 'unfulfilled',
                  outstandingQuantity: 350,
                },
                driftSignals: ['quantity_changed'],
                allocation: null,
              },
            ],
          },
        ],
      }),
    );

    expect(await screen.findByText('Ready for ordering')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordered quantity')).toBeDisabled();
    expect(
      screen.getByText("Nordwind Logistik GmbH's order quantity changed"),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nothing on the draft has changed and nothing will.'),
    ).toBeInTheDocument();
  });

  it('renders no Drift Signal alert for a draft without one, distinguishing it from a drifted one', async () => {
    render(draft({ state: 'ready_for_ordering', hasDriftSignal: false }));

    expect(await screen.findByText('Ready for ordering')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders a distinct summary for Closed and Discarded — the state lookup is total', async () => {
    const { unmount } = renderInEnteredWarehouse(
      <PurchaseDraftDetailPane
        draft={draft({
          state: 'closed',
          closureReason: 'Supplier discontinued the line',
        })}
      />,
      (() => {
        const store = authenticatedStore();
        seedPackagingTypes(store);
        return store;
      })(),
    );
    expect(
      await screen.findByText('Closure reason: Supplier discontinued the line'),
    ).toBeInTheDocument();
    unmount();

    renderInEnteredWarehouse(
      <PurchaseDraftDetailPane
        draft={draft({ state: 'discarded', lines: [] })}
      />,
      (() => {
        const store = authenticatedStore();
        seedPackagingTypes(store);
        return store;
      })(),
    );
    expect(
      await screen.findByText(
        'This draft was discarded before it was ordered.',
      ),
    ).toBeInTheDocument();
  });

  // jsdom applies no stylesheet, so the breakpoint behaviour is asserted
  // through the responsive utility classes the approved frames translate to,
  // exactly as `ItemDirectory.spec.tsx`'s responsive suite does.
  describe('responsive behaviour (desktop 1440 / mobile 390)', () => {
    it('carries the outer card frame from md: up, dropped by default (yGhkK/F0SpRx 1440 vs O42LHI 390)', async () => {
      render(draft({ state: 'draft' }));

      const section = await screen.findByRole('region', {
        name: '00000000-0000-4000-8000-000000000501',
      });
      const classes = section.className.split(/\s+/u);
      expect(classes).not.toContain('rounded-xl');
      expect(classes).not.toContain('border');
      expect(classes).not.toContain('bg-surface');
      expect(classes).toContain('md:rounded-xl');
      expect(classes).toContain('md:border');
      expect(classes).toContain('md:bg-surface');
    });
  });
});
