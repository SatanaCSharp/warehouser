import { useRouterState } from '@tanstack/react-router';
import type { WorkspaceContext } from '@warehouser/contracts/workspaces';
import { ROUTES } from 'shared/constants/routes';
import { useCurrentWorkspaceContext } from 'shared/hooks/queries/useWorkspacePermissions';

// T12 / CR-AC-05, amended by `global-loader/sad.md` §4.6 and §11 — the
// non-optional `WorkspaceContext` is **route-scoped**, not contract-wide.
//
// `guards/workspace.guard.ts` awaits and unwraps `getWorkspaceContext` in
// `workspaceRoute.beforeLoad`, so inside that match the entry is fulfilled
// before anything renders and the context cannot be absent. That guarantee is
// stated once, here, instead of at every call site: this projection is the one
// place that turns the read into a value with no optional half, so
// `WorkspaceAdministration` needs neither a readiness branch nor a
// `if (!workspaceContext) return null` (CH-05, CH-13).
//
// It is deliberately **not** a narrowing of `CurrentWorkspaceContext`.
// `shared/layouts/WarehouseSwitcher.tsx` and
// `shared/components/RetainedContextMessage.tsx` read that contract from the
// shell, where no route has awaited the context and CR-RG-08 requires the
// absence to stay observable — so its `workspaceContext` field stays optional.
//
// The match is looked up **by route id in the matches array**, the pattern
// `shared/hooks/projections/useEnteredWarehouse.ts` established and documents:
// `workspaceRoute.id` is assigned when a router builds its tree rather than
// when the module is imported, so `useMatch({ from })` would silently degrade
// to the nearest match. `ROUTES.WORKSPACE` is the id TanStack derives for a
// direct root child at that path, which keeps `shared/constants/routes.ts` the
// single owner of the literal and imports no route module.
//
// The value itself comes from the cache rather than from the match, because it
// must stay live: renaming the Workspace invalidates the entry, and the
// heading above the tabs re-reads the new name (AC-29).
export const useWorkspaceAdministrationContext = (): WorkspaceContext => {
  const isInsideWorkspaceRoute = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === ROUTES.WORKSPACE),
  });
  const { workspaceContext } = useCurrentWorkspaceContext();

  if (!isInsideWorkspaceRoute) {
    throw new Error(
      'useWorkspaceAdministrationContext may only be called inside the Workspace route, whose guard has awaited the Workspace context. Read useCurrentWorkspaceContext from the shell instead.',
    );
  }

  if (!workspaceContext) {
    throw new Error(
      'The Workspace context is absent inside the Workspace route, where requireWorkspaceCapability has already unwrapped it.',
    );
  }

  return workspaceContext;
};
