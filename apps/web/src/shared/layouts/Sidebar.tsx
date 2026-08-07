import { Drawer, DrawerContent, Link } from '@heroui/react';
import { Link as RouterLink, useRouterState } from '@tanstack/react-router';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useGetCurrentAccessQuery } from 'modules/access/api/access-api';
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
  const currentAccess = useGetCurrentAccessQuery();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const canReviewAccess = currentAccess.data?.permissionIds.some(
    (permission) =>
      permission === PermissionId.ROLES_WATCH ||
      permission === PermissionId.USERS_WATCH,
  );

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
      {canReviewAccess ? (
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
      ) : null}
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
