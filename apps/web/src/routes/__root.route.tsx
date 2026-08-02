import { createRootRouteWithContext } from '@tanstack/react-router';

import { RootLayout } from 'shared/layouts/RootLayout';

import type { AppStore } from 'store';

export interface RouterContext {
  store: AppStore;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});
