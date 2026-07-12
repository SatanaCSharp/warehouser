import { createRoute, rootRouteWithContext } from '@tanstack/react-router';

// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- no `components` alias is configured in vite.config.ts yet
import DesignSystemExample from '../components/DesignSystemExample';

import type { RootState } from 'store/index';

export interface RouterContext {
  getState: () => RootState;
}

export const rootRoute = rootRouteWithContext<RouterContext>()({});

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DesignSystemExample,
});
