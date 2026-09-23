import { useRouterState } from '@tanstack/react-router';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ROUTES } from 'shared/constants/routes';
import type { WorkspacePermissionScopedItem } from 'shared/hooks/projections/useWorkspacePermittedItems';
import { useWorkspacePermittedItems } from 'shared/hooks/projections/useWorkspacePermittedItems';
import { workspaceAdministrationPermissionIds } from 'shared/hooks/queries/useWorkspacePermissions';
import { Building2Icon, DashboardIcon } from 'shared/icons';

/** One entry of the Workspace view's rail, as the actor is offered it. */
export type WorkspaceNavEntry = {
  id: string;
  /** The address from `ROUTES` this entry navigates to. */
  to: string;
  /** The translated name the entry announces at either width. */
  label: string;
  /** The glyph the entry leads with. */
  Icon: ComponentType;
  /** Whether this entry addresses the destination currently on screen. */
  isActive: boolean;
};

type WorkspaceNavEntryDescriptor = WorkspacePermissionScopedItem & {
  id: string;
  to: string;
  labelKey: string;
  Icon: ComponentType;
};

/**
 * The Workspace view's entries in rail order — the Workspace Dashboard first,
 * then the Workspace administration destination (dashboards
 * `design-handoff.md` § Addresses and navigation). CR-AC-12: no
 * Warehouse-scoped destination appears here.
 *
 * Each names the Workspace Permissions that offer it in the same `permission`
 * field `WorkspacePermissionGate` takes, filtered by that gate's collection
 * form below — `adr/19-08-2026-declarative-permission-gates.md` §2. The
 * descriptor form is what lets the shell ask how many entries this actor is
 * offered without restating a single gate: the list the rail renders and the
 * list the shell counts are the same list.
 */
const workspaceNavEntryDescriptors: readonly WorkspaceNavEntryDescriptor[] = [
  // dashboards AC-15 — absent, not disabled, without the observation
  // Permission: the entry is what an actor who holds it is offered, and the
  // address is otherwise reached only by a stale link, a bookmark or a revoked
  // grant, where the denial is rendered at the address itself.
  {
    id: 'dashboard',
    to: ROUTES.WORKSPACE_DASHBOARD,
    labelKey: 'nav.dashboard',
    Icon: DashboardIcon,
    permission: WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
  },
  // AC-30 — gated by the Workspace-level read, not by the Warehouse-level
  // gate's vocabulary, and any one of the destination's Permissions admits it
  // because each opens its own part behind it. Holding none omits the entry
  // entirely.
  //
  // dashboards T19 — the entry reads **Administration**. With a second
  // Workspace destination present "Workspace" no longer names anything this
  // entry does; the address it leads to is unchanged.
  {
    id: 'administration',
    to: ROUTES.WORKSPACE,
    labelKey: 'nav.administration',
    Icon: Building2Icon,
    permission: workspaceAdministrationPermissionIds,
  },
];

/**
 * The Workspace rail entries this actor may see, in rail order.
 *
 * An unresolved Workspace context holds no Permission, so it offers no entry —
 * the withholding-while-unresolved behavior `WorkspacePermissionGate` already
 * documents (AC-30), inherited here rather than restated. The rail therefore
 * arrives with its first entry instead of painting empty chrome first.
 */
export const useWorkspaceNavEntries = (): WorkspaceNavEntry[] => {
  const { t } = useTranslation('common');
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const offered = useWorkspacePermittedItems(workspaceNavEntryDescriptors);

  return offered.map(({ id, to, labelKey, Icon }) => ({
    id,
    to,
    Icon,
    label: t(labelKey),
    isActive: pathname === to,
  }));
};
