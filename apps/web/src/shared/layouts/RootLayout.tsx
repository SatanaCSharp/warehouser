import { Button, Link } from '@heroui/react';
import {
  Link as RouterLink,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SignOutButton } from 'modules/auth/sign-out/components/SignOutButton';
import { selectIsAuthenticated } from 'modules/auth/store/auth.selectors';
import { ROUTES } from 'shared/constants/routes';
import { Footer } from 'shared/layouts/Footer';
import { LanguageSelector } from 'shared/layouts/LanguageSelector';
import { Sidebar } from 'shared/layouts/Sidebar';
import { useAppSelector } from 'store/hooks';

import type { ReactElement } from 'react';

const MenuIcon = (): ReactElement => (
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
      d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
    />
  </svg>
);

export const RootLayout = (): ReactElement => {
  const { t } = useTranslation('common');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isAuthRoute = pathname === ROUTES.LOGIN || pathname === ROUTES.SIGN_UP;
  const oppositeRoute =
    pathname === ROUTES.SIGN_UP ? ROUTES.LOGIN : ROUTES.SIGN_UP;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {isAuthRoute ? (
        <>
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
          <Outlet />
        </>
      ) : isAuthenticated ? (
        <div className="flex min-h-dvh flex-col">
          <header className="flex h-[68px] items-center justify-between border-b border-divider bg-content1 px-6 sm:h-20 sm:px-12">
            <Link
              as={RouterLink}
              to={ROUTES.HOME}
              color="foreground"
              className="text-xl font-bold"
            >
              Warehouser
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <LanguageSelector />
              <SignOutButton />
              <Button
                isIconOnly
                variant="light"
                aria-label={t('nav.toggle')}
                className="sm:hidden"
                onPress={() => setIsDrawerOpen(true)}
              >
                <MenuIcon />
              </Button>
            </div>
          </header>
          <div className="flex flex-1">
            <Sidebar isOpen={isDrawerOpen} onOpenChange={setIsDrawerOpen} />
            <div className="min-w-0 flex-1">
              <Outlet />
            </div>
          </div>
          <Footer />
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
};
