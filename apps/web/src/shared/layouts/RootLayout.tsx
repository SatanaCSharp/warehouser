import { Button } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import {
  Link as RouterLink,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { SignOutButton } from 'modules/auth/sign-out/components/SignOutButton';
import { selectIsAuthenticated } from 'modules/auth/store/auth.selectors';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { ROUTES } from 'shared/constants/routes';
import { useEnteredContext } from 'shared/hooks/projections/useEnteredContext';
import { MenuIcon } from 'shared/icons';
import { Footer } from 'shared/layouts/Footer';
import { LanguageSelector } from 'shared/layouts/LanguageSelector';
import { RoutedContent } from 'shared/layouts/RoutedContent';
import { Sidebar } from 'shared/layouts/sidebar/Sidebar';
import { WarehouseSwitcher } from 'shared/layouts/WarehouseSwitcher';
import { useAppSelector } from 'store/hooks';

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
  const isSignUpRoute = pathname === ROUTES.SIGN_UP;
  const oppositeRoute = isSignUpRoute ? ROUTES.LOGIN : ROUTES.SIGN_UP;
  // Both halves of the cross-link are translated copy, so they read from the
  // `common` namespace like every other string this header renders. Picking
  // which key applies is a ternary over a *value*, which
  // `writing-web-components.md` §6 leaves untouched.
  const oppositePrompt = isSignUpRoute
    ? t('auth.signInPrompt')
    : t('auth.signUpPrompt');
  const oppositeLabel = isSignUpRoute
    ? t('auth.signIn')
    : t('auth.createAccount');

  const onOpenDrawer = (): void => setIsDrawerOpen(true);

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
              {/* The language is chosen before signing in, not only after: the
                  sign-in and sign-up copy is translated, so an actor who cannot
                  read the default language must be able to switch while they are
                  still on these two routes. It leads the cross-link because the
                  actor picks the language they read the prompt in first. */}
              <LanguageSelector />
              <span className="hidden sm:inline">{oppositePrompt}</span>
              <RouterLink
                to={oppositeRoute}
                className={buttonVariants({ variant: 'outline' })}
              >
                {oppositeLabel}
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
              <Conditional when={hasNavigationList}>
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label={t('nav.toggle')}
                  className="sm:hidden"
                  onPress={onOpenDrawer}
                >
                  <MenuIcon />
                </Button>
              </Conditional>
            </div>
          </header>
          <div className="w-full border-b border-border bg-surface px-6 py-3 sm:hidden">
            <WarehouseSwitcher />
          </div>
          <div className="flex flex-1">
            <Sidebar isOpen={isDrawerOpen} onOpenChange={setIsDrawerOpen} />
            {/* The retained messages and the routed outlet, plus the
                transition they re-enter on when the destination changes —
                entering another Warehouse or the Workspace from the context
                switcher included. `RoutedContent` owns both. */}
            <RoutedContent />
          </div>
          <Footer />
        </div>
      ) : (
        <Outlet />
      )}
    </div>
  );
};
