import {
  createMemoryHistory,
  createRouter,
  Router,
} from '@tanstack/react-router';

import { loginRoute } from 'modules/auth/login/route';
import { signUpRoute } from 'modules/auth/sign-up/route';
import { homeRoute } from 'modules/home/route';
import { rootRoute } from 'routes/__root.route';
import { store } from 'store';

import type { AppStore } from 'store';

const routeTree = rootRoute.addChildren([homeRoute, loginRoute, signUpRoute]);

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
