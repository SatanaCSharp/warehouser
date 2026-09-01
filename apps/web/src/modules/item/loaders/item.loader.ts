import { PermissionId } from '@warehouser/shared-types/enums';

import { admitsReads } from 'guards/warehouse-entry.guard';
import { itemApi } from 'modules/item/api/item-api';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { hasPermission } from 'shared/hooks/queries/usePermissions';

import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { RouterContext } from 'routes/__root.route';

/**
 * The router context inside `itemRoute`: the application context every route
 * carries, plus the entry verdict `warehouseRoute.beforeLoad` publishes into
 * the Warehouse layout match.
 */
export type ItemLoaderContext = RouterContext & WarehouseEntryVerdict;

export type ItemLoaderInput = { context: ItemLoaderContext };

/**
 * A loader-filled entry holds no subscriber of its own; the destination's own
 * query hook is what retains it for the page's lifetime (sad.md §4.4).
 */
const LOADER_QUERY_OPTIONS = { subscribe: false } as const;

/**
 * `itemRoute`'s await window: the entry-verdict gate, the projection the
 * `ITEMS:WATCH` check is read from, and the Items list that projection admits.
 *
 * **The gate comes first, and it issues nothing.** `warehouseRoute.beforeLoad`
 * returns a refusal verdict rather than throwing, so this loader still runs on
 * an address the actor was just refused. A refused verdict returns
 * immediately: neither the projection nor the Items read is issued, so the
 * request count around a refusal stays at zero.
 *
 * AC-23 — a READ-ONLY verdict reads. An archived Warehouse authorizes no
 * operation that changes what it holds, but a member whose Role carries
 * `ITEMS:WATCH` reads its Items exactly as before archiving, so `admitsReads`
 * — not `status === 'entered'` — is the gate. The Permission check below is
 * unchanged, so a member without the Permission is refused the read exactly as
 * before archiving too.
 *
 * It imports no page and no component: `route.tsx` reaches it from the router
 * chunk, so pulling one in would defeat the lazy `import('./page')` boundary.
 */
export const loadItems = async ({
  context,
}: ItemLoaderInput): Promise<void> => {
  if (!admitsReads(context)) {
    return;
  }

  const { store, warehouseId } = context;

  const access = await store
    .dispatch(
      accessPermissionsApi.endpoints.getCurrentAccess.initiate(
        warehouseId,
        LOADER_QUERY_OPTIONS,
      ),
    )
    .unwrap();

  if (!hasPermission(access.permissionIds, PermissionId.ITEMS_WATCH)) {
    return;
  }

  await store.dispatch(
    itemApi.endpoints.listItems.initiate(warehouseId, LOADER_QUERY_OPTIONS),
  );
};
