import { createRouter } from "@tanstack/react-router";
import { rootRoute, indexRoute } from "./routes/index.route.js";
import { store } from "./store/index.js";

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({
  routeTree,
  context: { getState: () => store.getState() }
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
