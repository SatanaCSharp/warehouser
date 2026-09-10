import { PermissionId } from '@warehouser/shared-types/enums';
import includes from 'lodash/includes.js';

// AC-09a / ADR 0001 — whether a projection this actor is served may carry customer identity. The
// input is the **granted** subset of the Permissions the handler declared with
// `@ObservedPermission`, resolved by `WarehouseAccessGuard` after the required Permission had
// already admitted the request, so consulting it here can only ever narrow what is returned
// (server-request-authorization.md § "Consume the observed set in the projection").
//
// A predicate over the identifiers rather than over the principal: it names the condition once and
// depends on nothing but the values it is handed. It lives in `shared/predicates/` rather than in
// one feature because **two** features now decide it — `customer-orders` for a Customer Order and
// its destination, `purchase-drafts` for a draft line's Customer destination and its links — and
// two copies of a redaction condition is one copy too many (server-error-handling.md §1
// "multiple server features").
export const readsCustomerIdentity = (
  observedPermissionIds: readonly PermissionId[],
): boolean => includes(observedPermissionIds, PermissionId.CUSTOMERS_WATCH);
