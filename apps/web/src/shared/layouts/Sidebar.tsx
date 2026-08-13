import { Drawer } from '@heroui/react';
import { Link as RouterLink, useRouterState } from '@tanstack/react-router';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { PermissionGate } from 'shared/components/PermissionGate';
import { WorkspaceGate } from 'shared/components/WorkspaceGate';
import { ROUTES } from 'shared/constants/routes';
import { useEnteredWarehouse } from 'shared/hooks/useEnteredWarehouse';
import { workspaceAdministrationPermissionIds } from 'shared/hooks/useWorkspacePermissions';
import { Building2Icon, DashboardIcon, ShieldCheckIcon } from 'shared/icons';

import type { ReactElement } from 'react';

export type SidebarProps = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

export const Sidebar = ({
  isOpen = false,
  onOpenChange,
}: SidebarProps = {}): ReactElement => {
  const { t } = useTranslation('common');
  const warehouseId = useEnteredWarehouse();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // T6 / CR-AC-11 — the Access entry is addressed within the entered Warehouse.
  // Resolving the pattern from `ROUTES` keeps `shared/constants/routes.ts` the
  // single owner of every path literal while still allowing the active-item
  // comparison the other entries use.
  const accessPathname = warehouseId
    ? ROUTES.WAREHOUSE_ACCESS.replace('$warehouseId', warehouseId)
    : undefined;
  const itemClassName = (isActive: boolean): string =>
    isActive
      ? 'flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-accent-soft-foreground'
      : 'flex items-center gap-2 rounded-lg px-3 py-2 text-foreground hover:bg-surface-hover';

  const navList = (onNavigate?: () => void): ReactElement => (
    <ul className="space-y-1 p-4">
      <li>
        <RouterLink
          to={ROUTES.HOME}
          className={itemClassName(pathname === ROUTES.HOME)}
          onClick={onNavigate}
        >
          <DashboardIcon />
          {t('nav.dashboard')}
        </RouterLink>
      </li>
      {warehouseId ? (
        <PermissionGate
          permission={[PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH]}
        >
          <li>
            <RouterLink
              to={ROUTES.WAREHOUSE_ACCESS}
              params={{ warehouseId }}
              className={itemClassName(pathname === accessPathname)}
              onClick={onNavigate}
            >
              <ShieldCheckIcon />
              {t('nav.access')}
            </RouterLink>
          </li>
        </PermissionGate>
      ) : null}
      {/* AC-30 — the Workspace entry is gated by the Workspace-level read, not
          by `PermissionGate`'s Warehouse-level vocabulary, and any one of the
          destination's Permissions admits it because each opens its own part
          behind it. Holding none omits the entry entirely. */}
      <WorkspaceGate permission={workspaceAdministrationPermissionIds}>
        <li>
          <RouterLink
            to={ROUTES.WORKSPACE}
            className={itemClassName(pathname === ROUTES.WORKSPACE)}
            onClick={onNavigate}
          >
            <Building2Icon />
            {t('nav.workspace')}
          </RouterLink>
        </li>
      </WorkspaceGate>
    </ul>
  );

  return (
    <>
      <nav
        aria-label={t('nav.label')}
        className="hidden w-[240px] shrink-0 border-r border-border bg-surface sm:block"
      >
        {navList()}
      </nav>
      <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Drawer.Content placement="left" className="w-[240px] max-w-[80vw]">
          <Drawer.Dialog aria-label={t('nav.label')}>
            <nav aria-label={t('nav.label')}>
              {navList(() => onOpenChange?.(false))}
            </nav>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  );
};
