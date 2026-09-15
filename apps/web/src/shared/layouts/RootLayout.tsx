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

/** Which of the three shells the root renders. The two sign-in routes take the marketing header
 * whether or not a session exists; everything else depends on whether one does. */
type RootShellState = 'anonymous' | 'auth' | 'signedIn';

type RootShellReading = {
  isAuthRoute: boolean;
  isAuthenticated: boolean;
};

/** The shells that displace the bare outlet, most significant first. */
const displacingShells: readonly {
  state: RootShellState;
  holds: (reading: RootShellReading) => boolean;
}[] = [
  { state: 'auth', holds: ({ isAuthRoute }) => isAuthRoute },
  { state: 'signedIn', holds: ({ isAuthenticated }) => isAuthenticated },
];

const resolveShellState = (reading: RootShellReading): RootShellState => {
  const displacing = displacingShells.find(({ holds }) => holds(reading));

  return displacing?.state ?? 'anonymous';
};

const isAuthRouteOf = (pathname: string): boolean =>
  pathname === ROUTES.LOGIN || pathname === ROUTES.SIGN_UP;

// Both halves of the cross-link are translated copy, so they read from the `common` namespace like
// every other string this header renders. Picking which key applies is a ternary over a *value*,
// which `writing-web-components.md` §6 leaves untouched.
const oppositeRouteOf = (
  isSignUpRoute: boolean,
): typeof ROUTES.LOGIN | typeof ROUTES.SIGN_UP =>
  isSignUpRoute ? ROUTES.LOGIN : ROUTES.SIGN_UP;

const oppositePromptKey = (isSignUpRoute: boolean): string =>
  isSignUpRoute ? 'auth.signInPrompt' : 'auth.signUpPrompt';

const oppositeLabelKey = (isSignUpRoute: boolean): string =>
  isSignUpRoute ? 'auth.signIn' : 'auth.createAccount';

export const RootLayout = (): ReactElement => {
  const { t } = useTranslation('common');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  // T11 / CR-AC-18 — the drawer toggle exists to open the sidebar's list, so it
  // renders exactly when there is a list to open. Both components read the same
  // predicate, so no context can offer a control that opens an empty drawer.
  const hasNavigationList = useEnteredContext().kind !== 'none';
  const isSignUpRoute = pathname === ROUTES.SIGN_UP;
  const oppositeRoute = oppositeRouteOf(isSignUpRoute);
  const oppositePrompt = t(oppositePromptKey(isSignUpRoute));
  const oppositeLabel = t(oppositeLabelKey(isSignUpRoute));
  const shellState = resolveShellState({
    isAuthRoute: isAuthRouteOf(pathname),
    isAuthenticated,
  });

  const onOpenDrawer = (): void => setIsDrawerOpen(true);

  const shell: Record<RootShellState, ReactElement> = {
    auth: (
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
    ),
    signedIn: (
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
    ),
    anonymous: <Outlet />,
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {shell[shellState]}
    </div>
  );
};
