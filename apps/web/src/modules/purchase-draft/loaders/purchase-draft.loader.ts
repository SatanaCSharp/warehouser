import { PermissionId } from '@warehouser/shared-types/enums';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import { admitsReads } from 'guards/warehouse-entry.guard';
import { purchaseDraftApi } from 'modules/purchase-draft/api/purchase-draft-api';
import type { RouterContext } from 'routes/__root.route';
import { accessPermissionsApi } from 'shared/api/access/access-permissions-api';
import { hasPermission } from 'shared/hooks/queries/usePermissions';

/**
 * The router context inside `purchaseDraftRoute`: the application context
 * every route carries, plus the entry verdict `warehouseRoute.beforeLoad`
 * publishes into the Warehouse layout match.
 */
export type PurchaseDraftLoaderContext = RouterContext & WarehouseEntryVerdict;

export type PurchaseDraftLoaderInput = { context: PurchaseDraftLoaderContext };

/**
 * A loader-filled entry holds no subscriber of its own; the destination's own
 * query hook is what retains it for the page's lifetime (sad.md §4.4).
 */
const LOADER_QUERY_OPTIONS = { subscribe: false } as const;

/**
 * `purchaseDraftRoute`'s await window: the entry-verdict gate, the projection
 * the `PURCHASE_DRAFTS:WATCH` check is read from, and the Purchase Draft
 * summaries that projection admits (AC-16a, AC-23).
 *
 * **The gate comes first, and it issues nothing.** `warehouseRoute.beforeLoad`
 * returns a refusal verdict rather than throwing, so this loader still runs
 * on an address the actor was just refused. A refused verdict returns
 * immediately: neither the projection nor the Purchase Drafts read is issued,
 * so the request count around a refusal stays at zero.
 *
 * AC-23 — a READ-ONLY verdict reads. An archived Warehouse authorizes no
 * operation that changes what it holds, but a member whose Role carries
 * `PURCHASE_DRAFTS:WATCH` reads its drafts exactly as before archiving, so
 * `admitsReads` — not `status === 'entered'` — is the gate. The Permission
 * check below is unchanged, so a member without the Permission is refused the
 * read exactly as before archiving too.
 *
 * It imports no page and no component: `route.tsx` reaches it from the
 * router chunk, so pulling one in would defeat the lazy `import('./page')`
 * boundary.
 */
export const loadPurchaseDrafts = async ({
  context,
}: PurchaseDraftLoaderInput): Promise<void> => {
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
    !hasPermission(access.permissionIds, PermissionId.PURCHASE_DRAFTS_WATCH)
  ) {
    return;
  }

  await store.dispatch(
    purchaseDraftApi.endpoints.listPurchaseDrafts.initiate(
      { warehouseId },
      LOADER_QUERY_OPTIONS,
    ),
  );
};
