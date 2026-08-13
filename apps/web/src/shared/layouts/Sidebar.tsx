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

/**
 * T10 / CR-AC-11, CR-AC-12, CR-AC-18 — the shell's navigation, selected by the
 * entered context rather than by one flat list mixing both authority levels:
 *
 * - **Warehouse view** — Dashboard and Access, both addressed within that
 *   `:warehouseId`. No Workspace destination appears.
 * - **Workspace view** — the Workspace administration entry only. No
 *   Warehouse-scoped destination appears.
 * - **No context** — at the root and around a refusal, no list and no `<nav>`
 *   landmark at all, rather than an empty one.
 *
 * The context comes from the matched route tree — `useEnteredWarehouse()` and
 * the `/workspace` match — never from the pathname, so a refusal (which renders
 * AT a Warehouse address) correctly counts as no context.
 */
export const Sidebar = ({
  isOpen = false,
  onOpenChange,
}: SidebarProps = {}): ReactElement | null => {
  const { t } = useTranslation('common');
  const warehouseId = useEnteredWarehouse();
  const isWorkspaceView = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === ROUTES.WORKSPACE),
  });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const itemClassName = (isActive: boolean): string =>
    isActive
      ? 'flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-accent-soft-foreground'
      : 'flex items-center gap-2 rounded-lg px-3 py-2 text-foreground hover:bg-surface-hover';

  // Resolving each pattern from `ROUTES` keeps `shared/constants/routes.ts` the
  // single owner of every path literal while still allowing the active-item
  // comparison (frontend-architecture.md §"Guards and paths").
  const addressIn = (pattern: string, id: string): string =>
    pattern.replace('$warehouseId', id);

  const warehouseNavList = (
    enteredWarehouseId: string,
    onNavigate?: () => void,
  ): ReactElement => (
    <ul className="space-y-1 p-4">
      <li>
        <RouterLink
          to={ROUTES.WAREHOUSE}
          params={{ warehouseId: enteredWarehouseId }}
          className={itemClassName(
            pathname === addressIn(ROUTES.WAREHOUSE, enteredWarehouseId),
          )}
          onClick={onNavigate}
        >
          <DashboardIcon />
          {t('nav.dashboard')}
        </RouterLink>
      </li>
      {/* CR-AC-11 / CR-AC-19 — the gate is the shipped `ROLES:WATCH ∪
          USERS:WATCH` predicate, unmodified, now evaluated against the ADDRESSED
          Warehouse's own projection. Its falsy/loading behavior is inherited
          verbatim: absent while unresolved, present once it arrives, never a
          held-over value from the Warehouse just left. */}
      <PermissionGate
        permission={[PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH]}
      >
        <li>
          <RouterLink
            to={ROUTES.WAREHOUSE_ACCESS}
            params={{ warehouseId: enteredWarehouseId }}
            className={itemClassName(
              pathname ===
                addressIn(ROUTES.WAREHOUSE_ACCESS, enteredWarehouseId),
            )}
            onClick={onNavigate}
          >
            <ShieldCheckIcon />
            {t('nav.access')}
          </RouterLink>
        </li>
      </PermissionGate>
    </ul>
  );

  const workspaceNavList = (onNavigate?: () => void): ReactElement => (
    <ul className="space-y-1 p-4">
      {/* AC-30 — gated by the Workspace-level read, not by `PermissionGate`'s
          Warehouse-level vocabulary, and any one of the destination's
          Permissions admits it because each opens its own part behind it.
          Holding none omits the entry entirely. */}
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

  // CR-AC-18 — no context entered: render no list rather than an empty one, and
  // no landmark to announce it. This is also the refusal case (CR-AC-07), whose
  // entries would be addressed inside a Warehouse the actor was just refused.
  if (!warehouseId && !isWorkspaceView) {
    return null;
  }

  const navList = (onNavigate?: () => void): ReactElement =>
    warehouseId
      ? warehouseNavList(warehouseId, onNavigate)
      : workspaceNavList(onNavigate);

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
