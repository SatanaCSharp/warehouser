import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { WorkspacePermissionId as WorkspacePermissionIdValue } from '@warehouser/shared-types/enums';
import { workspaceMembersApi } from 'modules/access/api/workspace-members-api';
import { workspaceRolesApi } from 'modules/access/api/workspace-roles-api';
import { hasWorkspacePermission } from 'shared/hooks/queries/useWorkspacePermissions';
import type { AppStore } from 'store';

export type WorkspaceAdministrationAccessDatasetsInput = {
  store: AppStore;
  /**
   * The Workspace Permissions `modules/workspace` already resolved for the
   * actor. They arrive as an argument so the composing module never learns
   * which of them gate this module's datasets (sad.md §5.4).
   */
  workspacePermissionIds: readonly WorkspacePermissionId[];
};

type GatedDataset = {
  dispatch: () => Promise<unknown>;
  permission: WorkspacePermissionId;
};

/**
 * A loader-filled entry holds no subscriber of its own, exactly as
 * `guards/workspace.guard.ts` and `guards/warehouse-entry.guard.ts` dispatch.
 * The force-mounted panel's own query hook is what retains it for the
 * destination's lifetime (sad.md §4.4).
 */
const LOADER_QUERY_OPTIONS = { subscribe: false } as const;

/**
 * The three Workspace-administration datasets `modules/access` owns, each
 * beside the Workspace Permission that admits it — the same gate the dataset's
 * own hook applies, so the loader and the hook cannot disagree (CR-RG-02):
 * `useWorkspaceMembers` for the Members read, `useWorkspaceRoles` and
 * `useWorkspacePermissionCatalogue` for the two `WORKSPACE_ROLES:WATCH` reads.
 */
const gatedDatasets = (store: AppStore): readonly GatedDataset[] => [
  {
    dispatch: () =>
      store.dispatch(
        workspaceMembersApi.endpoints.listWorkspaceMembers.initiate(
          undefined,
          LOADER_QUERY_OPTIONS,
        ),
      ),
    permission: WorkspacePermissionIdValue.WORKSPACE_MEMBERS_WATCH,
  },
  {
    dispatch: () =>
      store.dispatch(
        workspaceRolesApi.endpoints.listWorkspaceRoles.initiate(
          undefined,
          LOADER_QUERY_OPTIONS,
        ),
      ),
    permission: WorkspacePermissionIdValue.WORKSPACE_ROLES_WATCH,
  },
  {
    dispatch: () =>
      store.dispatch(
        workspaceRolesApi.endpoints.listWorkspacePermissions.initiate(
          undefined,
          LOADER_QUERY_OPTIONS,
        ),
      ),
    permission: WorkspacePermissionIdValue.WORKSPACE_ROLES_WATCH,
  },
];

/**
 * `modules/access`'s contribution to `/workspace`'s route loader: it dispatches
 * the datasets the actor's Workspace Permissions admit and hands the resulting
 * requests back for the composing loader to settle in one
 * `Promise.allSettled` round (ADR 0001, sad.md §4.2, §5.4).
 *
 * It deliberately does not await them. Awaiting here would serialize this
 * module's reads against the workspace module's, and `spec.md` §6 bounds
 * `/workspace`'s first paint by the slowest admitted dataset rather than their
 * sum. An actor holding neither watch Permission — the rename-only actor of
 * CR-AC-03 — issues nothing at all.
 *
 * It imports no page and no component: `route.tsx` reaches it from the router
 * chunk, so pulling one in would defeat the lazy `import('./page')` boundary.
 */
export const loadWorkspaceAdministrationAccessDatasets = ({
  store,
  workspacePermissionIds,
}: WorkspaceAdministrationAccessDatasetsInput): Promise<unknown>[] =>
  gatedDatasets(store)
    .filter(({ permission }) =>
      hasWorkspacePermission(workspacePermissionIds, permission),
    )
    .map(({ dispatch }) => dispatch());
