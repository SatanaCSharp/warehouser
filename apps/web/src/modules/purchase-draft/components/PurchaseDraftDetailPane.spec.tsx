import { screen } from '@testing-library/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { describe, expect, it } from 'vitest';

import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { PurchaseDraftDetailPane } from 'modules/purchase-draft/components/PurchaseDraftDetailPane';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
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

/**
 * AC-22 — the pane's fields are gated on `PURCHASE_DRAFTS:UPDATE`, so the
 * actor under test here is one who holds it; what a `PURCHASE_DRAFTS:WATCH`
 * actor is offered is `PurchaseDraftLineEditor.spec`'s subject.
 */
const seedPermissions = (store: AppStore): void => {
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: Object.values(PermissionId),
        archivedAt: null,
      },
    ),
  );
};

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
  reference: 'PD-0143',
  state: 'draft',
  expectedArrivalDate: null,
  lineCount: 1,
  hasDriftSignal: false,
  hasDirectToCustomerAddressDrift: false,
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
      deliveryMode: 'via_warehouse',
      warehouseDestination: {
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes: null,
        frozen: false,
      },
      customerDestination: null,
      links: [],
    },
  ],
  ...overrides,
});

const render = (detail: PurchaseDraftDetail): AppStore => {
  const store = authenticatedStore();
  seedPermissions(store);
  seedPackagingTypes(store);
  renderInEnteredWarehouse(<PurchaseDraftDetailPane draft={detail} />, store);
  return store;
};

describe('PurchaseDraftDetailPane', () => {
  it('names the draft by its reference and attributes it, in the header', async () => {
    render(draft({ state: 'draft' }));

    expect(
      await screen.findByRole('heading', { name: 'PD-0143' }),
    ).toBeInTheDocument();
    // The acting user's own id resolves to "you"; no person name exists to
    // render for anyone else (BRIEF §Attribution).
    expect(
      screen.getByText(
        'Created by you · 1 Aug 2026 · every change is recorded as you make it',
      ),
    ).toBeInTheDocument();
  });

  it('renders an editable line for a draft in the Draft state', async () => {
    render(draft({ state: 'draft' }));

    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toBeEnabled();
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
            deliveryMode: 'via_warehouse',
            warehouseDestination: {
              addressText: 'Test Warehouse North, Test Industrial Estate',
              accessNotes: null,
              frozen: false,
            },
            customerDestination: null,
            links: [
              {
                id: '00000000-0000-4000-8000-000000000801',
                customerOrderId: '00000000-0000-4000-8000-000000000901',
                customer: null,
                customerName: 'Nordwind Logistik GmbH',
                statedQuantity: 400,
                snapshot: {
                  capturedDeliveryAddressId: null,
                  capturedDeliveryAddressText: null,
                  capturedQuantity: 400,
                  capturedNeededBy: '2026-09-01',
                  capturedState: 'unfulfilled',
                },
                current: {
                  quantity: 350,
                  neededBy: '2026-09-01',
                  state: 'unfulfilled',
                  outstandingQuantity: 350,
                  lastChangedAt: '2026-08-25T12:00:00.000Z',
                  deliveryAddress: null,
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
    expect(screen.getByLabelText('Quantity')).toBeDisabled();
    // AC-16 — the bullet states the comparison, naming both the captured value
    // and the one it moved to, never that "something changed".
    expect(
      screen.getByText(
        'Nordwind Logistik GmbH — quantity lowered from 400 to 350 on 25 Aug, still needed by 1 Sep.',
      ),
    ).toBeInTheDocument();
    // …and the per-link chip says which value moved, not "Drift detected".
    expect(screen.getByText('Lowered to 350 on 25 Aug')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nothing on the draft has changed and nothing will. What to do about this is your decision — a value amended and then put back as it was stops being reported.',
      ),
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

      const section = await screen.findByRole('region', { name: 'PD-0143' });
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
