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
import { RetainedContextMessage } from 'shared/components/RetainedContextMessage';
import { ROUTES } from 'shared/constants/routes';
import { useEnteredContext } from 'shared/hooks/useEnteredContext';
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
  // T11 / CR-AC-18 — the drawer toggle exists to open the sidebar's list, so it
  // renders exactly when there is a list to open. Both components read the same
  // predicate, so no context can offer a control that opens an empty drawer.
  const hasNavigationList = useEnteredContext().kind !== 'none';
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
              {hasNavigationList ? (
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label={t('nav.toggle')}
                  className="sm:hidden"
                  onPress={() => setIsDrawerOpen(true)}
                >
                  <MenuIcon />
                </Button>
              ) : null}
            </div>
          </header>
          <div className="w-full border-b border-border bg-surface px-6 py-3 sm:hidden">
            <WarehouseSwitcher />
          </div>
          <div className="flex flex-1">
            <Sidebar isOpen={isDrawerOpen} onOpenChange={setIsDrawerOpen} />
            <div className="min-w-0 flex-1">
              {/* T19 / CR-RG-03 — the retained messages are page-level
                  content, so they mount once here, above the routed outlet,
                  and never inside the fixed-height header the switcher sits
                  in. Mounting them on every page is what lets the remembered
                  Warehouse of the selection-ended message observe the stored
                  selection ending while the actor is still inside the context
                  it named (CR-AC-20). */}
              <RetainedContextMessage />
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
