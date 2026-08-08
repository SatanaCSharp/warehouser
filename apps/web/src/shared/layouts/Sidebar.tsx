import { Drawer, DrawerContent, Link } from '@heroui/react';
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
      ? 'flex items-center gap-2 rounded-medium bg-primary-100 px-3 py-2 text-primary'
      : 'flex items-center gap-2 rounded-medium px-3 py-2';

  const navList = (onNavigate?: () => void): ReactElement => (
    <ul className="space-y-1 p-4">
      <li>
        <Link
          as={RouterLink}
          to={ROUTES.HOME}
          color={pathname === ROUTES.HOME ? 'primary' : 'foreground'}
          className={itemClassName(pathname === ROUTES.HOME)}
          onPress={onNavigate}
        >
          <DashboardIcon />
          {t('nav.dashboard')}
        </Link>
      </li>
      <PermissionGate
        permission={[PermissionId.ROLES_WATCH, PermissionId.USERS_WATCH]}
      >
        <li>
          <Link
            as={RouterLink}
            to={ROUTES.ACCESS}
            color={pathname === ROUTES.ACCESS ? 'primary' : 'foreground'}
            className={itemClassName(pathname === ROUTES.ACCESS)}
            onPress={onNavigate}
          >
            <ShieldCheckIcon />
            {t('nav.access')}
          </Link>
        </li>
      </PermissionGate>
    </ul>
  );

  return (
    <>
      <nav
        aria-label={t('nav.label')}
        className="hidden w-[240px] shrink-0 border-r border-divider bg-content1 sm:block"
      >
        {navList()}
      </nav>
      <Drawer
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        placement="left"
        size="xs"
      >
        <DrawerContent aria-label={t('nav.label')}>
          <nav aria-label={t('nav.label')}>
            {navList(() => onOpenChange?.(false))}
          </nav>
        </DrawerContent>
      </Drawer>
    </>
  );
};
