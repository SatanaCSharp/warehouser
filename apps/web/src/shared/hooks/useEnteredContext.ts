import { useRouterState } from '@tanstack/react-router';

import { ROUTES } from 'shared/constants/routes';
import { useEnteredWarehouse } from 'shared/hooks/useEnteredWarehouse';

export type EnteredContext =
  | { kind: 'warehouse'; warehouseId: string }
  | { kind: 'workspace' }
  | { kind: 'none' };

// T10, T11 — which context the actor is currently inside, read from the
// MATCHED ROUTE TREE rather than the pathname. A refusal renders AT a Warehouse
// address but is not a Warehouse view, so only the entry verdict can tell the
// two apart (CR-AC-07).
//
// This is one predicate with two consumers that must never disagree: `Sidebar`
// decides which navigation list to render from it (CR-AC-11, CR-AC-12,
// CR-AC-18), and `RootLayout` decides whether to offer the drawer toggle at
// all. If they drifted, the shell would offer a control that opens an empty
// drawer — exactly what CR-AC-18 forbids.
export const useEnteredContext = (): EnteredContext => {
  const warehouseId = useEnteredWarehouse();
  const isWorkspaceView = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === ROUTES.WORKSPACE),
  });

  if (warehouseId) {
    return { kind: 'warehouse', warehouseId };
  }

  if (isWorkspaceView) {
    return { kind: 'workspace' };
  }

  return { kind: 'none' };
};
