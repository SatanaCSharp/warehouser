export const ROUTES = {
  ACCESS: '/access',
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
export const ROUTE_SEGMENTS = {
  ACCESS: 'access',
  SPLAT: '$',
} as const;
