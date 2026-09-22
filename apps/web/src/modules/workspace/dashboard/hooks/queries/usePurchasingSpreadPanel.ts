import type { PurchasingSpreadPanel } from '@warehouser/contracts/dashboards';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { workspaceDashboardApi } from 'modules/workspace/dashboard/api/workspace-dashboard-api';
import type { WorkspacePanelReading } from 'modules/workspace/dashboard/utils/workspace-panel-reading';
import { useHasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';

/**
 * The PurchasingSpread Panel: whether the actor's Workspace Role admits it, and the
 * body the route's loader awaited.
 *
 * One hook per Panel read, because a gate belongs to the read it gates
 * (`docs/system/guides/placing-web-hooks.md` §2), and because the parity gate
 * in `test/loader-permission-parity/` reconciles each dataset's own gate
 * against its loader's — which it can do only while one file states one gate.
 *
 * The generated hook is mounted rather than the cache read through
 * `endpoints.X.select()`: the loader dispatches with `subscribe: false`, so
 * without this subscription RTK Query collects the entry `keepUnusedDataFor`
 * (60 s) after it settles and the Panel vanishes mid-session. It costs no
 * second read, because AC-26's refetch-on-entering is declared on the loader's
 * dispatch rather than on the endpoint.
 *
 * All four Workspace Panels share **one** admitting Permission (AC-22), so
 * each states the same one; the parity gate is what keeps the four and the
 * loader in step.
 */

export const usePurchasingSpreadPanel =
  (): WorkspacePanelReading<PurchasingSpreadPanel> => {
    const permitted = useHasWorkspacePermission([
      WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
    ]);
    const { data, isError } =
      workspaceDashboardApi.useReadPurchasingSpreadQuery(undefined, {
        skip: !permitted,
      });

    return { body: data, failed: isError, permitted };
  };
