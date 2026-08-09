import { Drawer } from '@heroui/react';
import { Link as RouterLink, useRouterState } from '@tanstack/react-router';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { PermissionGate } from 'shared/components/PermissionGate';
import { ROUTES } from 'shared/constants/routes';
import { DashboardIcon, ShieldCheckIcon } from 'shared/icons';

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
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

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
      <PermissionGate
        permission={[PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH]}
      >
        <li>
          <RouterLink
            to={ROUTES.ACCESS}
            className={itemClassName(pathname === ROUTES.ACCESS)}
            onClick={onNavigate}
          >
            <ShieldCheckIcon />
            {t('nav.access')}
          </RouterLink>
        </li>
      </PermissionGate>
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
