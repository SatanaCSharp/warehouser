import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import i18n from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { PurchaseDraftTransitions } from 'modules/purchase-draft/components/purchase-draft-transitions/PurchaseDraftTransitions';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

import type {
  PurchaseDraftDetail,
  PurchaseDraftState,
} from '@warehouser/contracts/purchase-drafts';
import type { AppStore } from 'store';

// T21 — the owner of the four irreversible acts: which of them a draft state
// admits, each behind the Permission that offers it (AC-22,
// `docs/system/adr/19-08-2026-declarative-permission-gates.md`).
//
// DoD: "A test proves discard is not offered for a ready draft" (AC-24a) and
// "focus restored on close". Which transitions a state offers is this
// component's decision, so it is asserted here rather than in any one dialog.

const draft = (
  overrides: Partial<PurchaseDraftDetail> = {},
): PurchaseDraftDetail => ({
  id: '00000000-0000-4000-8000-000000000501',
  reference: 'PD-0143',
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
      packagingTypeId: null,
      valueAddingNote: null,
      receivedQuantity: null,
      links: [],
    },
  ],
  ...overrides,
});

const renderTransitions = (
  detail: PurchaseDraftDetail = draft(),
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): AppStore => {
  stubAccessServer({ permissionIds });
  const store = authenticatedStore();
  void store.dispatch(
    accessPermissionsApi.util.upsertQueryData(
      'getCurrentAccess',
      accessIds.warehouse,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds: [...permissionIds],
        archivedAt: null,
      },
    ),
  );
  renderInEnteredWarehouse(
    <PurchaseDraftTransitions draft={detail} />,
    store,
    accessIds.warehouse,
  );
  return store;
};

const trigger = (name: RegExp): Promise<HTMLElement> =>
  screen.findByRole('button', { name });

const noTrigger = (name: RegExp): void => {
  expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
};

describe('PurchaseDraftTransitions', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('uk');
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('offers a draft the two acts its state admits, and neither of the frozen ones', async () => {
    renderTransitions(draft({ state: 'draft' }));

    expect(await trigger(/move to ready/iu)).toBeInTheDocument();
    expect(await trigger(/discard/iu)).toBeInTheDocument();
    noTrigger(/confirm arrival/iu);
    noTrigger(/close with a reason/iu);
  });

  it('never offers discard for a draft already made ready (AC-24a)', async () => {
    renderTransitions(draft({ state: 'ready_for_ordering' }));

    expect(await trigger(/confirm arrival/iu)).toBeInTheDocument();
    expect(await trigger(/close with a reason/iu)).toBeInTheDocument();
    noTrigger(/discard/iu);
    noTrigger(/move to ready/iu);
  });

  it.each<PurchaseDraftState>(['closed', 'discarded'])(
    'offers no transition at all once a draft is %s',
    async (state) => {
      renderTransitions(draft({ state }));

      await waitFor(() =>
        expect(screen.queryAllByRole('button')).toHaveLength(0),
      );
    },
  );

  it('withholds each act from an actor whose Role does not carry its Permission (AC-22)', async () => {
    renderTransitions(draft({ state: 'draft' }), [
      PermissionId.PURCHASE_DRAFTS_WATCH,
      PermissionId.PURCHASE_DRAFTS_DISCARD,
    ]);

    expect(await trigger(/discard/iu)).toBeInTheDocument();
    noTrigger(/move to ready/iu);
  });

  it('returns focus to the trigger when its dialog is dismissed', async () => {
    const user = userEvent.setup();
    renderTransitions(draft({ state: 'draft' }));

    const discard = await trigger(/discard/iu);
    await user.click(discard);

    const dialog = await screen.findByRole('alertdialog', {
      name: /discard/iu,
    });
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));

    await waitFor(() => expect(discard).toHaveFocus());
  });
});
