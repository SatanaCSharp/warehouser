import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { PurchaseDraftWorkspace } from 'modules/purchase-draft/components/PurchaseDraftWorkspace';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type {
  PurchaseDraftDetail,
  PurchaseDraftSummary,
} from '@warehouser/contracts/purchase-drafts';
import type { AppStore } from 'store';

// T20 — the Purchase drafts destination's composition root: the three tabs,
// the list-and-detail split, and the mobile back affordance.

const summary = (
  overrides: Partial<PurchaseDraftSummary>,
): PurchaseDraftSummary => ({
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
  ...overrides,
});

const detailOf = (draftSummary: PurchaseDraftSummary): PurchaseDraftDetail => ({
  ...draftSummary,
  lines: [],
});

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

describe('PurchaseDraftWorkspace', () => {
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

    await user.click(screen.getByRole('tab', { name: 'Ready for ordering' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('selects a draft to reveal its detail, with a back-to-list affordance', async () => {
    const store = authenticatedStore();
    seed(store, [summary({ id: 'draft-one', state: 'draft' })]);
    const user = userEvent.setup();
    renderInEnteredWarehouse(<PurchaseDraftWorkspace />, store);

    await screen.findByRole('list', { name: 'Purchase drafts' });
    await user.click(screen.getByRole('button', { name: /1 line/iu }));

    expect(
      await screen.findByRole('button', { name: 'All purchase drafts' }),
    ).toBeInTheDocument();
  });
});
