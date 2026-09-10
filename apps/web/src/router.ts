import {
  createMemoryHistory,
  createRouter,
  Router,
} from '@tanstack/react-router';
import { accessRoute } from 'modules/access/route';
import { loginRoute } from 'modules/auth/login/route';
import { signUpRoute } from 'modules/auth/sign-up/route';
import { customerRoute } from 'modules/customer/route';
import { customerOrderRoute } from 'modules/customer-order/route';
import { homeRoute } from 'modules/home/route';
import { itemRoute } from 'modules/item/route';
import { purchaseDraftRoute } from 'modules/purchase-draft/route';
import { warehouseDashboardRoute } from 'modules/warehouse/route';
import { workspaceRoute } from 'modules/workspace/route';
import { rootRoute } from 'routes/__root.route';
import {
  rootCatchAllRoute,
  warehouseCatchAllRoute,
} from 'routes/catch-all.route';
import { warehouseRoute } from 'routes/warehouse.route';
import type { AppStore } from 'store';
import { store } from 'store';

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
    // T17 — the ordering web shell's three destinations, declared before the
    // splat so it keeps ranking last (sad.md §5 Web).
    customerOrderRoute,
    purchaseDraftRoute,
    itemRoute,
    // delivery-addresses T21 — the Customers destination, declared before the
    // splat for the same reason (that feature's sad.md §5 Web).
    customerRoute,
    warehouseCatchAllRoute,
  ]),
  // T7 — last root child: the splat ranks below every explicit route, so it
  // receives only addresses nothing else matched (CR-AC-16).
  rootCatchAllRoute,
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
