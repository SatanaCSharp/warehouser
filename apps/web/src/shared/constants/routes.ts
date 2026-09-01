// T4 — the relative segments a child of `ROUTES.WAREHOUSE` declares against
// its parent, so `shared/constants/routes.ts` stays the single owner of
// every path literal (frontend-architecture.md §"Guards and paths").
// T6 — `ACCESS` is now the access surface's own segment: the flat `/access`
// route is gone, and `ROUTES.WAREHOUSE_ACCESS` is the address it resolves to.
// T17 — `DEMAND`, `PURCHASE_DRAFTS` and `ITEMS` are the ordering web shell's
// three destination segments (sad.md §5 Web).
export const ROUTE_SEGMENTS = {
  ACCESS: 'access',
  DEMAND: 'demand',
  PURCHASE_DRAFTS: 'purchase-drafts',
  ITEMS: 'items',
  SPLAT: '$',
} as const;

const WAREHOUSE_PATH = '/warehouses/$warehouseId';

// T17 — every `WAREHOUSE_*` child address is `${WAREHOUSE_PATH}/<segment>`,
// following the ACCESS/WAREHOUSE_ACCESS precedent, so no path literal is
// repeated anywhere else.
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SIGN_UP: '/sign-up',
  WAREHOUSE: WAREHOUSE_PATH,
  WAREHOUSE_ACCESS: `${WAREHOUSE_PATH}/${ROUTE_SEGMENTS.ACCESS}`,
  WAREHOUSE_DEMAND: `${WAREHOUSE_PATH}/${ROUTE_SEGMENTS.DEMAND}`,
  WAREHOUSE_PURCHASE_DRAFTS: `${WAREHOUSE_PATH}/${ROUTE_SEGMENTS.PURCHASE_DRAFTS}`,
  WAREHOUSE_ITEMS: `${WAREHOUSE_PATH}/${ROUTE_SEGMENTS.ITEMS}`,
  WORKSPACE: '/workspace',
} as const;
