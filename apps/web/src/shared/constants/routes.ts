// T4 — the relative segments a child of `ROUTES.WAREHOUSE` declares against
// its parent, so `shared/constants/routes.ts` stays the single owner of
// every path literal (frontend-architecture.md §"Guards and paths").
// T6 — `ACCESS` is now the access surface's own segment: the flat `/access`
// route is gone, and `ROUTES.WAREHOUSE_ACCESS` is the address it resolves to.
// T17 — `DEMAND`, `PURCHASE_DRAFTS` and `ITEMS` are the ordering web shell's
// three destination segments (sad.md §5 Web).
// delivery-addresses T21 — `CUSTOMERS` is the Customers destination's segment.
// Route visibility is advisory UI behavior, never the server authorization
// boundary: the address exists for every actor and the server refuses the read
// (that feature's design-handoff.md §Implementation constraints, AC-09).
export const ROUTE_SEGMENTS = {
  ACCESS: 'access',
  DEMAND: 'demand',
  PURCHASE_DRAFTS: 'purchase-drafts',
  ITEMS: 'items',
  CUSTOMERS: 'customers',
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
  WAREHOUSE_CUSTOMERS: `${WAREHOUSE_PATH}/${ROUTE_SEGMENTS.CUSTOMERS}`,
  WORKSPACE: '/workspace',
} as const;
