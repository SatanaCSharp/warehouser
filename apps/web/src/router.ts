import { createRouter } from '@tanstack/react-router';

import { rootRoute, indexRoute } from 'routes/index.route';
import { loginRoute } from 'routes/login.route';
import { store } from 'store/index';

const routeTree = rootRoute.addChildren([indexRoute, loginRoute]);

export const router = createRouter({
  routeTree,
  context: { getState: () => store.getState() },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
