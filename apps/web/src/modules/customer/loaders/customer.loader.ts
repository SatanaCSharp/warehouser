import { PermissionId } from '@warehouser/shared-types/enums';

import { admitsReads } from 'guards/warehouse-entry.guard';
import { customerApi } from 'modules/customer/api/customer-api';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { hasPermission } from 'shared/hooks/queries/usePermissions';

import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import type { RouterContext } from 'routes/__root.route';

/**
 * The router context inside `customerRoute`: the application context every
 * route carries, plus the entry verdict `warehouseRoute.beforeLoad` publishes
 * into the Warehouse layout match.
 */
export type CustomerLoaderContext = RouterContext & WarehouseEntryVerdict;

export type CustomerLoaderInput = { context: CustomerLoaderContext };

/**
 * A loader-filled entry holds no subscriber of its own; the destination's own
 * query hook is what retains it for the page's lifetime (sad.md §4.4).
 */
const LOADER_QUERY_OPTIONS = { subscribe: false } as const;

/**
 * `customerRoute`'s await window: the entry-verdict gate, the projection the
 * `CUSTOMERS:WATCH` check is read from, and the Customers list that projection
 * admits.
 *
 * **AC-09 is why the order matters and why each gate returns rather than
 * fetching.** A member whose Role does not carry `CUSTOMERS:WATCH` must be
 * shown no customer name, no address, no quantity, no Item — and *no count* —
 * and the denial must not reveal whether any Customer exists at all. A refused
 * read would still put a request on the wire and a rejected entry in the
 * cache; the requirement is that nothing is asked. So a refused verdict
 * returns before anything is dispatched, and a resolved projection without the
 * Permission returns before the Customers read is dispatched. `xARSD` is the
 * frame: the destination is unreachable and the entry is absent.
 *
 * AC-23 — a READ-ONLY verdict reads. An archived Warehouse authorizes no
 * operation that changes what it holds, and a member holding `CUSTOMERS:WATCH`
 * reads its Customers exactly as before archiving, so `admitsReads` — not
 * `status === 'entered'` — is the gate.
 *
 * It imports no page and no component: `route.tsx` reaches it from the router
 * chunk, so pulling one in would defeat the lazy `import('./page')` boundary.
 */
export const loadCustomers = async ({
  context,
}: CustomerLoaderInput): Promise<void> => {
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

  if (!hasPermission(access.permissionIds, PermissionId.CUSTOMERS_WATCH)) {
    return;
  }

  await store.dispatch(
    customerApi.endpoints.listCustomers.initiate(
      warehouseId,
      LOADER_QUERY_OPTIONS,
    ),
  );
};
