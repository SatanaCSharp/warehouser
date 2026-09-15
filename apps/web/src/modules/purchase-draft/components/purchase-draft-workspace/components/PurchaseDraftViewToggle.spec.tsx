import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import type { PurchaseDraftSummary } from '@warehouser/contracts/purchase-drafts';
import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import { PurchaseDraftWorkspace } from 'modules/purchase-draft/components/purchase-draft-workspace/PurchaseDraftWorkspace';
import type { AppStore } from 'store';
import { accessIds, authenticatedStore } from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';
import { describe, expect, it } from 'vitest';

// T23 / AC-22 — the state tabs keep choosing *which* drafts; the toggle
// chooses *how you look at them* (design-handoff.md §Resolved here). The
// subject is the toggle, so its surface is exercised through the destination
// that mounts it (`placing-web-tests.md` §1).

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

const seed = (store: AppStore, drafts: PurchaseDraftSummary[]): void => {
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'listPurchaseDrafts',
      { warehouseId: accessIds.warehouse },
      drafts,
    ),
  );
};

/**
 * The toggle's own surface: one frozen draft on the `Ready for ordering` tab,
 * and the by-line read that tab issues — the surface's own read, not the route
 * loader's, so the spec seeds it exactly as it seeds the list beside it.
 *
 * It is the frozen tab and not `draft` because that is the only place the
 * toggle is offered (AC-22 scopes the split to frozen drafts); the caller has
 * to open the tab before the control exists, which `openFrozenTab` does.
 */
const renderToggleSurface = (): void => {
  const store = authenticatedStore();
  seed(store, [summary({ id: 'ready-one', state: 'ready_for_ordering' })]);
  void store.dispatch(
    purchaseDraftApi.util.upsertQueryData(
      'listPurchaseDraftLines',
      { warehouseId: accessIds.warehouse, state: 'ready_for_ordering' },
      [],
    ),
  );
  renderInEnteredWarehouse(<PurchaseDraftWorkspace />, store);
};

/** Opens the one tab that offers the toggle, and waits for it to appear. */
const openFrozenTab = async (user: UserEvent): Promise<void> => {
  await user.click(
    await screen.findByRole('tab', { name: /Ready for ordering/u }),
  );
  await screen.findByRole('radiogroup', { name: 'How to look at them' });
};

describe('the By draft / By line toggle (AC-22)', () => {
  it('switches the drafts destination to the split by delivery mode', async () => {
    const user = userEvent.setup();
    renderToggleSurface();
    await openFrozenTab(user);

    await user.click(screen.getByRole('radio', { name: 'By line' }));

    expect(
      await screen.findByRole('grid', {
        name: 'Lines landing at this warehouse',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('grid', {
        name: 'Lines shipping direct to customer',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Purchase drafts' }),
    ).not.toBeInTheDocument();
  });

  // Only the view on screen is mounted, in both directions: the list a
  // member is not looking at is not one more thing an assistive technology
  // walks past, and its read is not issued. The lookup that chooses the view
  // (`writing-web-conditional-components.md` §3) keeps that property because
  // element creation runs no hook — this pins it.
  it('unmounts the by-line split when the member looks by draft again', async () => {
    const user = userEvent.setup();
    renderToggleSurface();
    await openFrozenTab(user);

    await user.click(screen.getByRole('radio', { name: 'By line' }));
    await screen.findByRole('grid', {
      name: 'Lines landing at this warehouse',
    });
    await user.click(screen.getByRole('radio', { name: 'By draft' }));

    expect(
      await screen.findByRole('list', { name: 'Purchase drafts' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('grid', {
        name: 'Lines landing at this warehouse',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('grid', {
        name: 'Lines shipping direct to customer',
      }),
    ).not.toBeInTheDocument();
  });

  // AC-22 scopes the by-line split to **frozen** drafts, and frame `cvX6h`
  // draws the `Being worked on` toolbar with the `New draft` action alone.
  // A draft still being assembled has no dock to prepare, so the control is
  // absent there rather than present-and-inert.
  it('offers no toggle on the tab of drafts still being worked on', async () => {
    renderToggleSurface();

    await screen.findByRole('tab', { name: /Being worked on/u });

    expect(
      screen.queryByRole('radiogroup', { name: 'How to look at them' }),
    ).not.toBeInTheDocument();
  });

  // Leaving a frozen tab while looking by line must not strand the by-line
  // split on a tab that offers no way back to the list.
  it('returns to the by-draft read when the member leaves the frozen tab', async () => {
    const user = userEvent.setup();
    renderToggleSurface();
    await openFrozenTab(user);
    await user.click(screen.getByRole('radio', { name: 'By line' }));
    await screen.findByRole('grid', {
      name: 'Lines landing at this warehouse',
    });

    await user.click(screen.getByRole('tab', { name: /Being worked on/u }));

    expect(
      screen.queryByRole('grid', {
        name: 'Lines landing at this warehouse',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('radiogroup', { name: 'How to look at them' }),
    ).not.toBeInTheDocument();
  });

  it('names the two ways of looking as one radiogroup', async () => {
    const user = userEvent.setup();
    renderToggleSurface();
    await openFrozenTab(user);

    const toggle = screen.getByRole('radiogroup', {
      name: 'How to look at them',
    });

    expect(
      within(toggle).getByRole('radio', { name: 'By draft' }),
    ).toBeChecked();
    expect(
      within(toggle).getByRole('radio', { name: 'By line' }),
    ).toBeInTheDocument();
  });
});
