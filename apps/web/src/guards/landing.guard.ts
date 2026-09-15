import { redirect } from '@tanstack/react-router';
import type { RouterContext } from 'routes/__root.route';
import { workspaceContextApi } from 'shared/api/workspace/workspace-context-api';
import { ROUTES } from 'shared/constants/routes';
import {
  hasWorkspacePermission,
  workspaceAdministrationPermissionIds,
} from 'shared/hooks/queries/useWorkspacePermissions';

// T7 / CR-AC-08 — `/` is not a destination but the application's one landing
// resolver. Exactly three rules are evaluated in order and the first that
// matches decides, so at most one redirect is ever thrown and no actor is moved
// twice:
//
//   1. Workspace administration authority → the Workspace view.
//   2. A non-null effective Warehouse    → that Warehouse view.
//   3. Otherwise                          → return, and the root renders the
//                                           no-context state (CR-AC-18).
//
// Rule (1) reads the identical `workspaceAdministrationPermissionIds` set that
// `guards/workspace.guard.ts` admits on. That shared set — not any new logic —
// is what makes CR-RG-05 hold: an actor this rule sends to `/workspace` cannot
// be bounced straight back out of it.
//
// Rule (2) consumes the server's derivation exactly as reported. The web adds
// no membership-picking logic of its own, so several live memberships with no
// valid stored selection reach rule (3) rather than being resolved to a guess
// (CR-RG-04). `effectiveWarehouseId` is read here and in only two other places
// in `apps/web` (T13's allowlist).
//
// A failed read is deliberately NOT caught: the route's `errorComponent`
// renders the standard error state, because a failed read means the actor's
// access is unknown, not that they have none.
export const resolveLandingContext = async ({
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
    hasWorkspacePermission(
      workspaceContext.workspacePermissionIds,
      workspaceAdministrationPermissionIds,
    )
  ) {
    // TanStack Router handles its redirect descriptor as a thrown control signal.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: ROUTES.WORKSPACE });
  }

  const { effectiveWarehouseId } = workspaceContext;
  if (effectiveWarehouseId !== null) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({
      to: ROUTES.WAREHOUSE,
      params: { warehouseId: effectiveWarehouseId },
    });
  }
};
