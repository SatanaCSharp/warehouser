import { Link } from '@heroui/react';
import {
  Link as RouterLink,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';

import { ROUTES } from 'shared/constants/routes';

import type { ReactElement } from 'react';

export const RootLayout = (): ReactElement => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isAuthRoute = pathname === ROUTES.LOGIN || pathname === ROUTES.SIGN_UP;
  const oppositeRoute =
    pathname === ROUTES.SIGN_UP ? ROUTES.LOGIN : ROUTES.SIGN_UP;

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
      ) : null}
      <Outlet />
    </div>
  );
};
