import { Button } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
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
import { MenuIcon } from 'shared/icons';
import { Footer } from 'shared/layouts/Footer';
import { LanguageSelector } from 'shared/layouts/LanguageSelector';
import { Sidebar } from 'shared/layouts/Sidebar';
import { WarehouseSwitcher } from 'shared/layouts/WarehouseSwitcher';
import { useAppSelector } from 'store/hooks';

import type { ReactElement } from 'react';

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
          <header className="flex h-[68px] items-center justify-between border-b border-border bg-surface px-6 sm:h-20 sm:px-12">
            <RouterLink
              to={ROUTES.HOME}
              className="text-xl font-bold text-foreground"
            >
              Warehouser
            </RouterLink>
            <div className="flex items-center gap-3 text-sm text-muted">
              <span className="hidden sm:inline">
                {pathname === ROUTES.SIGN_UP
                  ? 'Already have an account?'
                  : 'New to Warehouser?'}
              </span>
              <RouterLink
                to={oppositeRoute}
                className={buttonVariants({ variant: 'outline' })}
              >
                {pathname === ROUTES.SIGN_UP ? 'Sign in' : 'Create account'}
              </RouterLink>
            </div>
          </header>
          <Outlet />
        </>
      ) : isAuthenticated ? (
        <div className="flex min-h-dvh flex-col">
          <header className="flex h-[68px] items-center justify-between border-b border-border bg-surface px-6 sm:h-20 sm:px-12">
            <RouterLink
              to={ROUTES.HOME}
              className="text-xl font-bold text-foreground"
            >
              Warehouser
            </RouterLink>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="hidden sm:flex">
                <WarehouseSwitcher />
              </div>
              <LanguageSelector />
              <SignOutButton />
              <Button
                isIconOnly
                variant="ghost"
                aria-label={t('nav.toggle')}
                className="sm:hidden"
                onPress={() => setIsDrawerOpen(true)}
              >
                <MenuIcon />
              </Button>
            </div>
          </header>
          <div className="w-full border-b border-border bg-surface px-6 py-3 sm:hidden">
            <WarehouseSwitcher />
          </div>
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
