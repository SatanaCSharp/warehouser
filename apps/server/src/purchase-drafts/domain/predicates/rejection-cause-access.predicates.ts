import { PermissionId } from '@warehouser/shared-types/enums';
import includes from 'lodash/includes';

// AC-21/AC-22 — whether the condition account this actor is served may carry a Rejection's cause:
// its Reason, description, Source and Disposition. The input is the **granted** subset of the
// Permissions the handler declared with `@ObservedPermission`, resolved by `WarehouseAccessGuard`
// after the required Permission had already admitted the request, so consulting it here can only
// ever narrow what is returned (server-request-authorization.md § "Consume the observed set in the
// projection").
//
// Independent of `shared/predicates/observed-permission.predicates.ts`'s `readsCustomerIdentity`,
// because the two Permissions gate two different facts about the same line and cross to give it
// its **four** legal shapes (sad.md §6.3, §10 "Redaction unit"). It stays local to
// `purchase-drafts` rather than moving to `shared/predicates/` — unlike `readsCustomerIdentity`,
// which two features consume, this predicate has exactly one consumer today, and
// `guides/server-error-handling.md` §1 is explicit that a predicate for one server feature lives in
// the feature; it can move the day a second feature reads a Rejection's cause.
export const readsRejectionCause = (
  observedPermissionIds: readonly PermissionId[],
): boolean => includes(observedPermissionIds, PermissionId.REJECTIONS_WATCH);
