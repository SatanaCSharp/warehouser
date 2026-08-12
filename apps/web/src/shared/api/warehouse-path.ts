/**
 * The one place a Warehouse-scoped REST path is built. Every access and users
 * endpoint lives under its Warehouse (`contracts/openapi.yaml`), so no endpoint
 * can address one without naming it — which is what stops a request from
 * silently borrowing the authority of whichever Warehouse the server would have
 * defaulted to (AC-05).
 */
export const warehousePath = (warehouseId: string, resource: string): string =>
  `/api/v1/warehouses/${warehouseId}/${resource}`;
