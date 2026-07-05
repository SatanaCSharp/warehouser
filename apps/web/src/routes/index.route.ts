import { createRoute, rootRouteWithContext } from "@tanstack/react-router";
import type { RootState } from "../store/index.js";

export interface RouterContext {
  getState: () => RootState;
}

export const rootRoute = rootRouteWithContext<RouterContext>()({});

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null
});
