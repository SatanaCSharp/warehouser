import { useRouterState } from '@tanstack/react-router';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { ROUTES } from 'shared/constants/routes';
import { workspaceAdministrationPermissionIds } from 'shared/hooks/queries/useWorkspacePermissions';
import { Building2Icon, DashboardIcon } from 'shared/icons';
import { SidebarNavItem } from 'shared/layouts/sidebar/components/SidebarNavItem';

export type WorkspaceNavEntriesProps = {
  /** Whether the list around these entries is reduced to its icon rail. */
  isCollapsed: boolean;
  /** What an entry reports when it is followed, for the drawer to close on. */
  onNavigate?: () => void;
};

/**
 * The Workspace view's entries — the Workspace Dashboard first, then the
 * Workspace administration destination (dashboards `design-handoff.md`
 * § Addresses and navigation). CR-AC-12: no Warehouse-scoped destination
 * appears here.
 *
 * Each gate stays an element at the entry it protects
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md` §1): a `<ul>`
 * is not a React Aria collection, so nothing stops a gate element sitting
 * inside it, and the two entries are gated on different Permission sets.
 */
export const WorkspaceNavEntries = ({
  isCollapsed,
  onNavigate,
}: WorkspaceNavEntriesProps): ReactElement => {
  const { t } = useTranslation('common');
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <>
      {/* dashboards AC-15 — absent, not disabled, without the observation
          Permission: the entry is what an actor who holds it is offered, and
          the address is otherwise reached only by a stale link, a bookmark or
          a revoked grant, where the denial is rendered at the address itself. */}
      <WorkspacePermissionGate
        permission={WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH}
      >
        <SidebarNavItem
          to={ROUTES.WORKSPACE_DASHBOARD}
          isCollapsed={isCollapsed}
          isActive={pathname === ROUTES.WORKSPACE_DASHBOARD}
          icon={<DashboardIcon />}
          label={t('nav.dashboard')}
          onNavigate={onNavigate}
        />
      </WorkspacePermissionGate>
      {/* AC-30 — gated by the Workspace-level read, not by the Warehouse-level
          gate's vocabulary, and any one of the destination's Permissions admits
          it because each opens its own part behind it. Holding none omits the
          entry entirely.

          dashboards T19 — the entry reads **Administration**. With a second
          Workspace destination present "Workspace" no longer names anything
          this entry does; the address it leads to is unchanged. */}
      <WorkspacePermissionGate
        permission={workspaceAdministrationPermissionIds}
      >
        <SidebarNavItem
          to={ROUTES.WORKSPACE}
          isCollapsed={isCollapsed}
          isActive={pathname === ROUTES.WORKSPACE}
          icon={<Building2Icon />}
          label={t('nav.administration')}
          onNavigate={onNavigate}
        />
      </WorkspacePermissionGate>
    </>
  );
};
