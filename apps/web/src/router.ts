import {
  createMemoryHistory,
  createRouter,
  Router,
} from '@tanstack/react-router';

import { accessRoute } from 'modules/access/route';
import { loginRoute } from 'modules/auth/login/route';
import { signUpRoute } from 'modules/auth/sign-up/route';
import { homeRoute } from 'modules/home/route';
import { warehouseDashboardRoute } from 'modules/warehouse/route';
import { workspaceRoute } from 'modules/workspace/route';
import { rootRoute } from 'routes/__root.route';
import { warehouseCatchAllRoute } from 'routes/catch-all.route';
import { warehouseRoute } from 'routes/warehouse.route';
import { store } from 'store';

import type { AppStore } from 'store';

// T6 / CH-03 — `accessRoute` is a child of the Warehouse layout, not a root
// child: every Warehouse-scoped surface is addressed within the Warehouse it
// operates on, and the splat ranks below the layout's explicit children so
// `/warehouses/:id/access` reaches the surface rather than not-found handling.
const routeTree = rootRoute.addChildren([
  homeRoute,
  loginRoute,
  signUpRoute,
  workspaceRoute,
  warehouseRoute.addChildren([
    warehouseDashboardRoute,
    accessRoute,
    warehouseCatchAllRoute,
  ]),
]);

type CreateAppRouterOptions = {
  appStore?: AppStore;
  initialEntries?: string[];
};

export type AppRouter = Router<typeof routeTree>;

export const createAppRouter = ({
  appStore = store,
  initialEntries,
}: CreateAppRouterOptions = {}): AppRouter =>
  createRouter({
    routeTree,
    context: { store: appStore },
    ...(initialEntries
      ? { history: createMemoryHistory({ initialEntries }) }
      : {}),
  });

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
