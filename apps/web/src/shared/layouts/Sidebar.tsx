import { Drawer, DrawerContent, Link } from '@heroui/react';
import { Link as RouterLink, useRouterState } from '@tanstack/react-router';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useGetCurrentAccessQuery } from 'modules/access/api/access-api';
import { ROUTES } from 'shared/constants/routes';

import type { ReactElement } from 'react';

export type SidebarProps = {
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

const DashboardIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M3.75 6a2.25 2.25 0 0 1 2.25-2.25h3a2.25 2.25 0 0 1 2.25 2.25v3a2.25 2.25 0 0 1-2.25 2.25h-3A2.25 2.25 0 0 1 3.75 9V6ZM3.75 15a2.25 2.25 0 0 1 2.25-2.25h3a2.25 2.25 0 0 1 2.25 2.25v3a2.25 2.25 0 0 1-2.25 2.25h-3A2.25 2.25 0 0 1 3.75 18v-3ZM12.75 6a2.25 2.25 0 0 1 2.25-2.25h3a2.25 2.25 0 0 1 2.25 2.25v3a2.25 2.25 0 0 1-2.25 2.25h-3a2.25 2.25 0 0 1-2.25-2.25V6ZM12.75 15a2.25 2.25 0 0 1 2.25-2.25h3a2.25 2.25 0 0 1 2.25 2.25v3a2.25 2.25 0 0 1-2.25 2.25h-3a2.25 2.25 0 0 1-2.25-2.25v-3Z"
    />
  </svg>
);

const ShieldCheckIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
    />
  </svg>
);

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
