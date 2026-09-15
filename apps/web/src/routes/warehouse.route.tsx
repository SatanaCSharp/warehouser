import { createRoute } from '@tanstack/react-router';
import { requireAuth } from 'guards/auth.guard';
import type { WarehouseEntryVerdict } from 'guards/warehouse-entry.guard';
import { resolveWarehouseEntry } from 'guards/warehouse-entry.guard';
import { rootRoute } from 'routes/__root.route';
import { RouteErrorState } from 'shared/components/RouteErrorState';
import { RoutePendingState } from 'shared/components/RoutePendingState';
import { ROUTES } from 'shared/constants/routes';
import { WarehouseLayout } from 'shared/layouts/WarehouseLayout';
import type { AppStore } from 'store';

// T4 / ADR 0001 §Amendment — TanStack Router reruns every matched route's
// `beforeLoad` on every navigation, with no gate on whether the match
// "stayed" (verified against the installed `@tanstack/router-core`; see the
// ADR amendment). Left unguarded, that would recompute the verdict — and
// could evict the actor — on every internal navigation inside a Warehouse
// (CR-AC-20). This cache preserves the verdict across navigation that stays
// inside the SAME Warehouse and forces a fresh `resolveWarehouseEntry` call
// whenever `params.warehouseId` changes, so moving W1 → W2 is never admitted
// on W1's verdict.
//
// Keyed by the request's own `store` instance (a `WeakMap`, not a bare
// module global): each `makeStore()` — one per app load and one per test —
// gets its own entry, so nothing leaks between sessions or tests, and
// nothing needs manual cleanup.
const lastVerdictByStore = new WeakMap<
  AppStore,
  { warehouseId: string; verdict: WarehouseEntryVerdict }
>();

// T4 / ADR 0001 — the Warehouse layout route. It owns no feature content: it
// resolves entry once per addressed Warehouse in `beforeLoad` and publishes
// the verdict into the match context, which `WarehouseLayout` and every
// descendant reads through `shared/hooks/projections/useEnteredWarehouse.ts`. Placed
// beside `__root.route.tsx` (sad.md §5 "Placement note") because it is
// application shell, not a feature — the parent every current and future
// Warehouse-scoped module attaches to.
export const warehouseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: ROUTES.WAREHOUSE,
  component: WarehouseLayout,
  errorComponent: RouteErrorState,
  pendingComponent: RoutePendingState,
  // T1 / CR-AC-16 — `beforeLoad` below is `async` unconditionally and awaits
  // `requireAuth` before its `lastVerdictByStore` lookup, so even a cached
  // verdict resolves through a microtask on every navigation that stays
  // inside a Warehouse. 150 ms is what keeps that microtask from painting
  // over a live destination; the router's own default is 1000 ms, which would
  // leave a real entry-verdict round trip unpainted (CR-AC-02).
  pendingMs: 150,
  // TanStack's default is 500 ms, which would hold the pending state on
  // screen after the verdict had arrived (`sad.md` §5.1).
  pendingMinMs: 0,
  beforeLoad: async ({
    context,
    params,
    cause,
  }): Promise<WarehouseEntryVerdict> => {
    await requireAuth(context);

    const cached = lastVerdictByStore.get(context.store);
    if (cause === 'stay' && cached?.warehouseId === params.warehouseId) {
      return cached.verdict;
    }

    const verdict = await resolveWarehouseEntry(context, params.warehouseId);
    lastVerdictByStore.set(context.store, {
      warehouseId: params.warehouseId,
      verdict,
    });
    return verdict;
  },
});
