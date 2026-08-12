import { redirect } from '@tanstack/react-router';

import { workspaceContextApi } from 'shared/api/workspace-context-api';
import { ROUTES } from 'shared/constants/routes';
import {
  hasWorkspacePermission,
  workspaceAdministrationWatchPermissionIds,
} from 'shared/hooks/useWorkspacePermissions';

import type { RouterContext } from 'routes/__root.route';

// AC-30 — route visibility is advisory UI behavior, never the server
// authorization boundary (design-handoff.md §Implementation constraints).
// This guard only keeps the web from presenting an unusable destination; the
// server independently refuses every Workspace-scoped request.
export const requireWorkspaceCapability = async ({
  store,
}: RouterContext): Promise<void> => {
  const workspaceContext = await store
    .dispatch(
      workspaceContextApi.endpoints.getWorkspaceContext.initiate(undefined, {
        subscribe: false,
      }),
    )
    .unwrap();

  if (
    !hasWorkspacePermission(
      workspaceContext.workspacePermissionIds,
      workspaceAdministrationWatchPermissionIds,
    )
  ) {
    // TanStack Router handles its redirect descriptor as a thrown control signal.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: ROUTES.HOME });
  }
};
