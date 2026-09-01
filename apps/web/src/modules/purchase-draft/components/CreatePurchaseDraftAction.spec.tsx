import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionId } from '@warehouser/shared-types/enums';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreatePurchaseDraftAction } from 'modules/purchase-draft/components/CreatePurchaseDraftAction';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import {
  accessIds,
  authenticatedStore,
  stubAccessServer,
} from 'test/access-fixtures';
import { renderInEnteredWarehouse } from 'test/render';

// AC-10 / AC-22 — starting a draft. Pressing "New draft" had no test anywhere
// in the suite that the POST is actually issued, which is the defect class the
// audit was about: a mutation whose call site nothing renders and presses.

const draftsUrl = `/api/v1/warehouses/${accessIds.warehouse}/purchase-drafts`;

type Recorded = { url: string; init?: RequestInit };

/** The JSON body a recorded request carried, as the endpoint sent it. */
const bodyOf = (init?: RequestInit): unknown =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as unknown;

const recordRequests = (): Recorded[] => {
  const served = globalThis.fetch;
  const recorded: Recorded[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL, init?: RequestInit) => {
      recorded.push({
        url: String(input instanceof Request ? input.url : input),
        init,
      });
      return served(input, init);
    }),
  );

  return recorded;
};

const renderAction = (
  permissionIds: readonly PermissionId[] = Object.values(PermissionId),
): Recorded[] => {
  stubAccessServer({ permissionIds });
  const recorded = recordRequests();
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

  renderInEnteredWarehouse(<CreatePurchaseDraftAction />, store);
  return recorded;
};

describe('CreatePurchaseDraftAction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts an empty draft when the control is pressed (AC-10)', async () => {
    const user = userEvent.setup();
    const recorded = renderAction();

    await user.click(await screen.findByRole('button', { name: 'New draft' }));

    await waitFor(() => {
      const posted = recorded.filter(
        ({ url, init }) => url === draftsUrl && init?.method === 'POST',
      );
      expect(posted).toHaveLength(1);
      // A draft is created empty and assembled line by line afterwards.
      expect(bodyOf(posted[0]?.init)).toStrictEqual({
        lines: [],
      });
    });
  });

  it('offers nothing to an actor whose Role does not carry the Permission (AC-22)', async () => {
    renderAction([PermissionId.PURCHASE_DRAFTS_WATCH]);

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'New draft' }),
      ).not.toBeInTheDocument(),
    );
  });
});
