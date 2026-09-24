import { useRouterState } from '@tanstack/react-router';
import { ROUTES } from 'shared/constants/routes';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

export type EnteredContext =
  | { kind: 'warehouse'; warehouseId: string }
  | { kind: 'workspace' }
  | { kind: 'none' };

/**
 * Every route id whose match means the actor is inside the Workspace. The
 * Workspace's destinations are flat root siblings rather than one branch — the
 * Workspace Dashboard declares `getParentRoute: () => rootRoute` so it inherits
 * nothing from the administration route, in particular not that route's
 * capability guard (dashboards AC-15) — so there is no single ancestor id to
 * match on and the set is enumerated. A Workspace destination added later joins
 * it here, which is the one edit that keeps the shell's rail with it.
 */
const workspaceRouteIds: readonly string[] = [
  ROUTES.WORKSPACE,
  ROUTES.WORKSPACE_DASHBOARD,
];

// T10, T11 — which context the actor is currently inside, read from the
// MATCHED ROUTE TREE rather than the pathname. A refusal renders AT a Warehouse
// address but is not a Warehouse view, so only the entry verdict can tell the
// two apart (CR-AC-07).
//
// This is one predicate with three consumers that must never disagree:
// `Sidebar` decides which navigation list to render from it (CR-AC-11,
// CR-AC-12, CR-AC-18), `RootLayout` decides whether to offer the drawer toggle
// at all, and `RetainedContextMessage` suppresses itself wherever a context is
// entered (CR-RG-03). If they drifted, the shell would offer a control that
// opens an empty drawer — exactly what CR-AC-18 forbids — or drop a
// warehouse-chooser block onto a surface that has entered one.
//
// A Warehouse is checked first and wins, but the two can never both hold: the
// entered Warehouse comes from the `ROUTES.WAREHOUSE` match's published verdict
// (`useWarehouseEntryVerdict`), not from a stored selection, and no Workspace
// address matches that route. So an actor with an active Warehouse selected
// still reads as `workspace` at a Workspace address.
export const useEnteredContext = (): EnteredContext => {
  const warehouseId = useEnteredWarehouse();
  const isWorkspaceView = useRouterState({
    select: (state) =>
      state.matches.some((match) => workspaceRouteIds.includes(match.routeId)),
  });

  if (warehouseId) {
    return { kind: 'warehouse', warehouseId };
  }

  if (isWorkspaceView) {
    return { kind: 'workspace' };
  }

  return { kind: 'none' };
};
