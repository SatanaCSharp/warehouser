import { useRouterState } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { ROUTES } from 'shared/constants/routes';
import { workspaceAdministrationPermissionIds } from 'shared/hooks/queries/useWorkspacePermissions';
import { Building2Icon } from 'shared/icons';
import { SidebarNavItem } from 'shared/layouts/sidebar/components/SidebarNavItem';

export type WorkspaceNavEntriesProps = {
  /** Whether the list around these entries is reduced to its icon rail. */
  isCollapsed: boolean;
  /** What an entry reports when it is followed, for the drawer to close on. */
  onNavigate?: () => void;
};

/**
 * The Workspace view's entries — the Workspace administration destination only.
 * CR-AC-12: no Warehouse-scoped destination appears here.
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
    // AC-30 — gated by the Workspace-level read, not by the Warehouse-level
    // gate's vocabulary, and any one of the destination's Permissions admits it
    // because each opens its own part behind it. Holding none omits the entry
    // entirely.
    <WorkspacePermissionGate permission={workspaceAdministrationPermissionIds}>
      <SidebarNavItem
        to={ROUTES.WORKSPACE}
        isCollapsed={isCollapsed}
        isActive={pathname === ROUTES.WORKSPACE}
        icon={<Building2Icon />}
        label={t('nav.workspace')}
        onNavigate={onNavigate}
      />
    </WorkspacePermissionGate>
  );
};
