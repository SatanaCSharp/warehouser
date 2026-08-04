import { Link } from '@heroui/react';
import {
  Link as RouterLink,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { PermissionId } from '@warehouser/shared-types/enums';

import { useGetCurrentAccessQuery } from 'modules/access/api/access-api';
import { SignOutButton } from 'modules/auth/sign-out/components/SignOutButton';
import { selectIsAuthenticated } from 'modules/auth/store/auth.selectors';
import { ROUTES } from 'shared/constants/routes';
import { useAppSelector } from 'store/hooks';

import type { ReactElement } from 'react';

export const RootLayout = (): ReactElement => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentAccess = useGetCurrentAccessQuery(undefined, {
    skip: !isAuthenticated,
  });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isAuthRoute = pathname === ROUTES.LOGIN || pathname === ROUTES.SIGN_UP;
  const oppositeRoute =
    pathname === ROUTES.SIGN_UP ? ROUTES.LOGIN : ROUTES.SIGN_UP;
  const canReviewAccess = currentAccess.data?.permissionIds.some(
    (permission) =>
      permission === PermissionId.ROLES_WATCH ||
      permission === PermissionId.USERS_WATCH,
  );

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {isAuthRoute ? (
        <header className="flex h-[68px] items-center justify-between border-b border-divider bg-content1 px-6 sm:h-20 sm:px-12">
          <Link
            as={RouterLink}
            to={ROUTES.HOME}
            color="foreground"
            className="text-xl font-bold"
          >
            Warehouser
          </Link>
          <div className="flex items-center gap-3 text-sm text-foreground-500">
            <span className="hidden sm:inline">
              {pathname === ROUTES.SIGN_UP
                ? 'Already have an account?'
                : 'New to Warehouser?'}
            </span>
            <Link
              as={RouterLink}
              to={oppositeRoute}
              color="primary"
              className="min-h-11 rounded-small border-2 border-primary px-4 font-medium"
            >
              {pathname === ROUTES.SIGN_UP ? 'Sign in' : 'Create account'}
            </Link>
          </div>
        </header>
      ) : isAuthenticated ? (
        <header className="flex h-[68px] items-center justify-between border-b border-divider bg-content1 px-6 sm:h-20 sm:px-12">
          <div className="flex items-center gap-6">
            <Link
              as={RouterLink}
              to={ROUTES.HOME}
              color="foreground"
              className="text-xl font-bold"
            >
              Warehouser
            </Link>
            {canReviewAccess ? (
              <Link as={RouterLink} to={ROUTES.ACCESS} color="foreground">
                Access
              </Link>
            ) : null}
          </div>
          <SignOutButton />
        </header>
      ) : null}
      <Outlet />
    </div>
  );
};
