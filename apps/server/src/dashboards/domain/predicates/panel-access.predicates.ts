import { PermissionId } from '@warehouser/shared-types/enums';
import { includes } from 'lodash-es';

// ADR 0001 — Coverage Gap and Arrival Timing are the two Warehouse Panels admitted by a
// **conjunction** of watch Permissions rather than by one. `@RequiredPermission` names the member
// the Panel's records are keyed by and admits the request at the guard; every other member of the
// set is declared `@ObservedPermission` and resolved onto `AccessCurrentUser.observedPermissionIds`
// (server-request-authorization.md § "Declare the Permissions a projection observes"). These
// predicates read only that resolved set — the required member has already admitted the request by
// the time either one runs (sad.md §6.2) — and answer whether the *rest* of the conjunction is held.
//
// Both are asked, never read: `read-coverage-gap.query.ts` and `read-arrival-timing.query.ts` each
// `assert` the answer before issuing any read, raising the shared non-enumerating denial
// (`shared/access/access-denial.errors.ts`) so a partial holder is refused exactly as an actor
// holding none of the set is — never disclosing which member fell short (AC-02, AC-02a).

// Coverage Gap — `@RequiredPermission(ITEMS_WATCH)`, `@ObservedPermission(CUSTOMER_ORDERS_WATCH,
// PURCHASE_DRAFTS_WATCH)`. Both observed members must be held together, so this checks each side of
// the conjunction rather than either one alone.
export const readsCoverageGap = (
  observedPermissionIds: readonly PermissionId[],
): boolean =>
  includes(observedPermissionIds, PermissionId.CUSTOMER_ORDERS_WATCH) &&
  includes(observedPermissionIds, PermissionId.PURCHASE_DRAFTS_WATCH);

// Arrival Timing — `@RequiredPermission(CUSTOMER_ORDERS_WATCH)`,
// `@ObservedPermission(PURCHASE_DRAFTS_WATCH)`. One observed member remains to check.
export const readsArrivalTiming = (
  observedPermissionIds: readonly PermissionId[],
): boolean =>
  includes(observedPermissionIds, PermissionId.PURCHASE_DRAFTS_WATCH);
