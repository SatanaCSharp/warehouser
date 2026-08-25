export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SIGN_UP: '/sign-up',
  WAREHOUSE: '/warehouses/$warehouseId',
  WAREHOUSE_ACCESS: '/warehouses/$warehouseId/access',
  WORKSPACE: '/workspace',
} as const;

// T4 — the relative segments a child of `ROUTES.WAREHOUSE` declares against
// its parent, so `shared/constants/routes.ts` stays the single owner of
// every path literal (frontend-architecture.md §"Guards and paths").
// T6 — `ACCESS` is now the access surface's own segment: the flat `/access`
// route is gone, and `ROUTES.WAREHOUSE_ACCESS` is the address it resolves to.
export const ROUTE_SEGMENTS = {
  ACCESS: 'access',
  SPLAT: '$',
} as const;
