import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Item } from '@warehouser/contracts/items';
import type {
  PurchaseDraftDetail,
  PurchaseDraftLine,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import { itemApi } from 'modules/item/api/item-api';
import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { PurchaseDraftWorkspace } from 'modules/purchase-draft/components/purchase-draft-workspace/PurchaseDraftWorkspace';
import { Provider } from 'react-redux';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { ROUTES } from 'shared/constants/routes';
import type { AppStore } from 'store';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { afterEach, describe, expect, it, vi } from 'vitest';

// T20 — the Purchase drafts destination's composition root: the three tabs,
// the list-and-detail split, and the mobile back affordance, plus AC-23's
// read-only entry: this is the destination the archived audit found had no
// archived-Warehouse test at all.

/**
 * The sentence `ArchivedWarehouseNotice` carries under
 * `ARCHIVED_WAREHOUSE_REASON_ID`; matching the description rather than the
 * heading is what proves a reference resolves to the element holding the id.
 */
const ARCHIVED_NOTICE =
  /nothing that changes what it holds is authorized any more/iu;

/** What one Line states for itself when the Warehouse refuses the write. */
const ARCHIVED_LINE_REASON =
  'This warehouse has been archived, so nothing on this draft can be changed any more.';

const summary = (
  overrides: Partial<PurchaseDraftSummary>,
): PurchaseDraftSummary => ({
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
  ...overrides,
});

const line: PurchaseDraftLine = {
  id: '00000000-0000-4000-8000-000000000601',
  itemId: '00000000-0000-4000-8000-000000000101',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
  unitOfMeasure: 'pieces',
  orderedQuantity: 400,
  packagingTypeId: null,
  valueAddingNote: null,
  ending: null,
  deliveryMode: 'via_warehouse',
  warehouseDestination: {
    addressText: 'Test Warehouse North, Test Industrial Estate',
    accessNotes: null,
    frozen: false,
  },
  customerDestination: null,
  links: [],
};

const item: Item = {
  id: line.itemId,
  sku: line.itemSku,
  description: line.itemDescription,
  unitOfMeasure: 'pieces',
  onHandQuantity: 0,
  deactivatedAt: null,
  namingCustomerOrderCount: 0,
  namingPurchaseDraftLineCount: 1,
  latestAdjustment: null,
  createdAt: '2026-08-01T09:00:00.000Z',
};

const detailOf = (draftSummary: PurchaseDraftSummary): PurchaseDraftDetail => ({
  ...draftSummary,
  lines: [],
});

/**
 * Seeds the list **without** any draft's detail, so the detail column is
 * exercised in the state it is actually in between selecting a draft and its
 * projection arriving — the state the pane used to answer with "Select a
 * purchase draft to see its lines."
 */
const seedListOnly = (
  store: AppStore,
  drafts: PurchaseDraftSummary[],
): void => {
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'listPurchaseDrafts',
      { warehouseId: accessIds.warehouse },
      drafts,
    ),
  );
};

const seed = (store: AppStore, drafts: PurchaseDraftSummary[]): void => {
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'listPurchaseDrafts',
      { warehouseId: accessIds.warehouse },
      drafts,
    ),
  );
  drafts.forEach((draft) => {
    void store.dispatch(
      purchaseDraftApi.util.upsertQueryData(
        'getPurchaseDraft',
        { warehouseId: accessIds.warehouse, purchaseDraftId: draft.id },
        detailOf(draft),
      ),
    );
  });
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'listPackagingTypes',
      accessIds.warehouse,
      [],
    ),
  );
};

/**
 * AC-23 — the read-only verdict is published by the Warehouse match itself, so
 * this suite exercises the real `useArchivedWarehouse` read rather than a stub:
 * what is under test is the destination's reaction to an archived Warehouse
 * end to end, notice included.
 */
const renderInArchivedWarehouse = (): void => {
  const store = authenticatedStore();
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: Object.values(PermissionId),
        archivedAt: '2026-08-20T09:00:00.000Z',
      },
    ),
  );
  const draft = summary({ id: 'draft-one', state: 'draft' });
  seed(store, [draft]);
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'getPurchaseDraft',
      { warehouseId: accessIds.warehouse, purchaseDraftId: draft.id },
      { ...detailOf(draft), lines: [line] },
    ),
  );
  void store.dispatch(
    itemApi.util.upsertQueryData('listItems', accessIds.warehouse, [item]),
  );

  const testRootRoute = createRootRouteWithContext<{ store: AppStore }>()({
    component: () => <Outlet />,
  });
  const warehouseTestRoute = createRoute({
    getParentRoute: () => testRootRoute,
    path: ROUTES.WAREHOUSE,
    beforeLoad: ({ params }): WarehouseEntryVerdict => ({
      status: 'entered-read-only',
      reason: 'archived',
      warehouseId: params.warehouseId,
    }),
    component: () => <Outlet />,
  });
  const subjectRoute = createRoute({
    getParentRoute: () => warehouseTestRoute,
    path: '/',
    component: PurchaseDraftWorkspace,
  });

  const router = createRouter({
    routeTree: testRootRoute.addChildren([
      warehouseTestRoute.addChildren([subjectRoute]),
    ]),
    context: { store },
    history: createMemoryHistory({
      initialEntries: [`/warehouses/${accessIds.warehouse}`],
    }),
  });

  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
};

describe('PurchaseDraftWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows only the drafts of the selected tab', async () => {
    const store = authenticatedStore();
    seed(store, [
      summary({ id: 'draft-one', state: 'draft' }),
      summary({ id: 'ready-one', state: 'ready_for_ordering' }),
    ]);
    const user = userEvent.setup();
    renderInEnteredWarehouse(<PurchaseDraftWorkspace />, store);

    expect(
      await screen.findByRole('list', { name: 'Purchase drafts' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    // Each tab carries the count of what it holds (frame `yGhkK`).
    expect(
      screen.getByRole('tab', { name: 'Being worked on · 1' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('tab', { name: 'Ready for ordering · 1' }),
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  // AC-23 — an archived Warehouse is entered read-only, so nothing that writes
  // vanishes: each control stays on screen, disabled, naming the sentence that
  // says why. `toHaveAccessibleDescription` resolves `aria-describedby` as an
  // assistive technology does, so it fails both when nothing is pointed at and
  // when the id names no element on the page.
  describe('an archived Warehouse (AC-23)', () => {
    it('keeps the destination readable and states the reason once', async () => {
      renderInArchivedWarehouse();

      expect(await screen.findByText('Archived warehouse')).toBeVisible();
      expect(screen.getByText(ARCHIVED_NOTICE)).toBeVisible();
      expect(
        await screen.findByRole('list', { name: 'Purchase drafts' }),
      ).toBeInTheDocument();
    });

    it('keeps “New draft” visible and disabled, describing it by that reason', async () => {
      renderInArchivedWarehouse();

      const newDraft = await screen.findByRole('button', {
        name: 'New draft',
      });
      expect(newDraft).toBeVisible();
      expect(newDraft).toBeDisabled();
      expect(newDraft).toHaveAccessibleDescription(ARCHIVED_NOTICE);
    });

    it('disables every control on the opened draft, each describing its own reason', async () => {
      const user = userEvent.setup();
      renderInArchivedWarehouse();

      await screen.findByRole('list', { name: 'Purchase drafts' });
      await user.click(screen.getByRole('button', { name: /PD-0143/iu }));

      // The draft's own transitions point at the destination's notice.
      const discard = await screen.findByRole('button', {
        name: 'Discard draft',
      });
      expect(discard).toBeDisabled();
      expect(discard).toHaveAccessibleDescription(ARCHIVED_NOTICE);

      const ready = screen.getByRole('button', {
        name: 'Move to Ready for ordering',
      });
      expect(ready).toBeDisabled();
      expect(ready).toHaveAccessibleDescription(ARCHIVED_NOTICE);

      // A Line states its own reason **once**, in the lock strip under the
      // line head, and the fields it disables point at that strip rather than
      // repeating the sentence into each of their captions
      // (design-handoff.md §Accessibility). Pointing at it is the whole of the
      // rule: the sentence is DRAWN once, and every disabled field announces
      // that one sentence. A field that announced nothing would leave a member
      // who cannot see the strip with no reason at all.
      expect(screen.getByLabelText('Item')).toBeDisabled();
      expect(screen.getByLabelText('Item')).toHaveAccessibleDescription(
        new RegExp(ARCHIVED_LINE_REASON, 'u'),
      );
      expect(
        screen.getByLabelText('Value-adding note'),
      ).toHaveAccessibleDescription(new RegExp(ARCHIVED_LINE_REASON, 'u'));
      // That the strip is drawn once *per line* is pinned by
      // `PurchaseDraftLineEditor.spec.tsx`; this draft carries several lines,
      // so counting the sentence across the whole surface would count strips,
      // not repetitions within one.

      const removeLine = screen.getByRole('button', {
        name: 'Remove line 1',
      });
      expect(removeLine).toBeDisabled();
      expect(removeLine).toHaveAccessibleDescription(ARCHIVED_LINE_REASON);
    });
  });

  /**
   * `usePurchaseDraft` reports `currentData`, which is absent both while the
   * selected draft's projection is in flight and permanently after a failed
   * read. The pane collapsed those two onto "nothing is selected", so a member
   * who had just selected a draft — and, at 390px, could no longer see the
   * list at all — was told to select one.
   */
  describe('the four states of the detail column', () => {
    const openFirstDraft = async (
      detail: 'pending' | 'failed',
    ): Promise<void> => {
      const store = authenticatedStore();
      seedListOnly(store, [summary({ id: 'draft-one', state: 'draft' })]);
      const detailUrl = `/api/v1/warehouses/${accessIds.warehouse}/purchase-drafts/draft-one`;
      vi.stubGlobal(
        'fetch',
        vi.fn((input: Request | string | URL) => {
          const url = String(input instanceof Request ? input.url : input);
          if (url !== detailUrl) {
            return Promise.resolve(Response.json({}, { status: 404 }));
          }
          return detail === 'failed'
            ? Promise.resolve(
                Response.json(
                  { code: 'api.unexpected', message: 'The read failed.' },
                  { status: 500 },
                ),
              )
            : new Promise<Response>(() => undefined);
        }),
      );

      const user = userEvent.setup();
      renderInEnteredWarehouse(<PurchaseDraftWorkspace />, store);
      await screen.findByRole('list', { name: 'Purchase drafts' });
      await user.click(screen.getByRole('button', { name: /PD-0143/iu }));
    };

    it('invites a selection only while nothing is selected', async () => {
      const store = authenticatedStore();
      seed(store, [summary({ id: 'draft-one', state: 'draft' })]);
      renderInEnteredWarehouse(<PurchaseDraftWorkspace />, store);

      expect(
        await screen.findByText('Select a purchase draft to see its lines.'),
      ).toBeInTheDocument();
    });

    it('waits for the draft it was asked for, rather than asking again', async () => {
      await openFirstDraft('pending');

      expect(
        await screen.findByRole('status', {
          name: 'Loading the purchase draft',
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Select a purchase draft to see its lines.'),
      ).not.toBeInTheDocument();
    });

    it('says the read failed, rather than standing there inviting a selection', async () => {
      await openFirstDraft('failed');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /this purchase draft could not be read/iu,
      );
      expect(
        screen.queryByText('Select a purchase draft to see its lines.'),
      ).not.toBeInTheDocument();
    });
  });

  it('selects a draft to reveal its detail, with a back-to-list affordance', async () => {
    const store = authenticatedStore();
    seed(store, [summary({ id: 'draft-one', state: 'draft' })]);
    const user = userEvent.setup();
    renderInEnteredWarehouse(<PurchaseDraftWorkspace />, store);

    await screen.findByRole('list', { name: 'Purchase drafts' });
    await user.click(screen.getByRole('button', { name: /PD-0143/iu }));

    expect(
      await screen.findByRole('button', { name: 'All purchase drafts' }),
    ).toBeInTheDocument();
  });
  // T23 / AC-22 — the state tabs keep choosing *which* drafts; the toggle
  // chooses *how you look at them* (design-handoff.md §Resolved here). It is
  // an explicitly unpinned presentation choice, so the test pins the
  // separation AC-22 requires rather than the control's styling.
});
