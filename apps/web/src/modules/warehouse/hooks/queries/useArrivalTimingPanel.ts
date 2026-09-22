import type { ArrivalTimingPanel } from '@warehouser/contracts/dashboards';
import { PermissionId } from '@warehouser/shared-types/enums';
import { warehouseDashboardApi } from 'modules/warehouse/api/warehouse-dashboard-api';
import type { PanelReading } from 'modules/warehouse/utils/panel-reading';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

/**
 * The ArrivalTiming Panel: whether the actor is admitted to it, and the body the
 * route's loader awaited.
 *
 * One hook per Panel read, because a gate belongs to the read it gates
 * (`docs/system/guides/placing-web-hooks.md` §2) — and because the parity gate
 * in `test/loader-permission-parity/` reconciles each dataset's own gate
 * against its loader's, which it can only do while one file states one gate.
 *
 * The generated hook is mounted rather than the cache read through
 * `endpoints.X.select()`: the loader dispatches with `subscribe: false`, so
 * without this subscription RTK Query collects the entry `keepUnusedDataFor`
 * (60 s) after it settles and the Panel vanishes mid-session. It costs no
 * second read, because AC-26's refetch-on-entering is declared on the loader's
 * dispatch rather than on the endpoint.
 *
 * The Permission set is two Permissions together (`spec.md` §6.1). It is read as a boolean
 * because the answer feeds this query's `skip`, which
 * `docs/system/adr/19-08-2026-declarative-permission-gates.md` §Decision 3
 * admits, and it never leaves this file.
 */

export const useArrivalTimingPanel = (
  warehouseId: string,
): PanelReading<ArrivalTimingPanel> => {
  const permitted = useHasPermission(
    [PermissionId.CUSTOMER_ORDERS_WATCH, PermissionId.PURCHASE_DRAFTS_WATCH],
    'all',
  );
  const { data, isError } = warehouseDashboardApi.useReadArrivalTimingQuery(
    warehouseId,
    {
      skip: !permitted,
    },
  );

  return { body: data, failed: isError, permitted };
};
