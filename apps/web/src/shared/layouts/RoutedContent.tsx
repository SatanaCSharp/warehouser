import { Outlet, useRouterState } from '@tanstack/react-router';

import { RetainedContextMessage } from 'shared/components/RetainedContextMessage';
import { useContentTransition } from 'shared/hooks/effects/useContentTransition';

import type { ReactElement } from 'react';

/**
 * The shell's content region: the retained-context messages above whatever the
 * matched route renders, and the short transition both re-enter on whenever
 * the destination changes.
 *
 * The transition is keyed on the pathname, so it covers the two navigations an
 * actor makes most: entering another Warehouse or the Workspace from the
 * context switcher, and moving between a Warehouse's destinations. Both are
 * ordinary route changes, so neither the switcher nor a destination link has to
 * know that anything animates — one region owns the motion for every way in.
 *
 * It exists as its own component rather than as a few lines inside
 * `RootLayout` because the layout already resolves authentication, the drawer,
 * the auth-route split and the navigation list; the content region's own
 * pathname read and ref belong with the element they act on
 * (`writing-web-components.md` §2, §3).
 *
 * T19 / CR-RG-03 — the retained messages stay page-level content mounted above
 * the routed outlet and never inside the fixed-height header the switcher sits
 * in. Mounting them on every page is what lets the remembered Warehouse of the
 * selection-ended message observe the stored selection ending while the actor
 * is still inside the context it named (CR-AC-20).
 */
export const RoutedContent = (): ReactElement => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const contentRef = useContentTransition<HTMLDivElement>(pathname);

  return (
    <div ref={contentRef} className="min-w-0 flex-1">
      <RetainedContextMessage />
      <Outlet />
    </div>
  );
};
