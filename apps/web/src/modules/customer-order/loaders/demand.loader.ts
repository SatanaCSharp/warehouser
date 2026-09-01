import { PermissionId } from '@warehouser/shared-types/enums';

import { admitsReads } from 'guards/warehouse-entry.guard';
import { customerOrderApi } from 'modules/customer-order/api/customer-order-api';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { hasPermission } from 'shared/hooks/queries/usePermissions';

import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { RouterContext } from 'routes/__root.route';

/**
 * The router context inside `customerOrderRoute`: the application context
 * every route carries, plus the entry verdict `warehouseRoute.beforeLoad`
 * publishes into the Warehouse layout match.
 */
export type DemandLoaderContext = RouterContext & WarehouseEntryVerdict;

export type DemandLoaderInput = { context: DemandLoaderContext };

/**
 * A loader-filled entry holds no subscriber of its own; the destination's own
 * query hook is what retains it for the page's lifetime (sad.md §4.4).
 */
const LOADER_QUERY_OPTIONS = { subscribe: false } as const;

/**
 * `customerOrderRoute`'s await window: the entry-verdict gate, the projection
 * the `CUSTOMER_ORDERS:WATCH` check is read from, and the consolidated demand
 * that projection admits.
 *
 * **The gate comes first, and it issues nothing.** `warehouseRoute.beforeLoad`
 * returns a refusal verdict rather than throwing, so this loader still runs on
 * an address the actor was just refused. A refused verdict returns
 * immediately: neither the projection nor the demand read is issued, so the
 * request count around a refusal stays at zero and no customer name, quantity
 * or Item can leak through it (AC-05).
 *
 * AC-23 — a READ-ONLY verdict reads. An archived Warehouse authorizes no
 * operation that changes what it holds, but a member whose Role carries
 * `CUSTOMER_ORDERS:WATCH` reads its recorded demand exactly as before
 * archiving, so `admitsReads` — not `status === 'entered'` — is the gate. The
 * Permission check below is unchanged, so a member without the Permission is
 * refused the read exactly as before archiving too.
 *
 * It imports no page and no component: `route.tsx` reaches it from the router
 * chunk, so pulling one in would defeat the lazy `import('./page')` boundary.
 */
export const loadDemand = async ({
  context,
}: DemandLoaderInput): Promise<void> => {
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

  if (
    !hasPermission(access.permissionIds, PermissionId.CUSTOMER_ORDERS_WATCH)
  ) {
    return;
  }

  await store.dispatch(
    customerOrderApi.endpoints.readDemand.initiate(
      warehouseId,
      LOADER_QUERY_OPTIONS,
    ),
  );
};
