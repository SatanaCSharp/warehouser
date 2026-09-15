import { PermissionId } from '@warehouser/shared-types/enums';
import { includes } from 'lodash-es';
import type {
  LineConditionAccount,
  LineConditionWithCause,
} from 'purchase-drafts/domain/mappers/line-condition.mapper';
import type {
  PurchaseDraftLineEndingRead,
  PurchaseDraftLineEndingWithCauseRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';

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

// AC-01a — whether this actor may raise a Rejection at all: the write-side twin of
// `readsRejectionCause` above, over the same `@ObservedPermission`-resolved granted subset. Reading
// it can only ever **narrow** an already-admitted request — a submission that refuses nothing never
// consults it (server-request-authorization.md § "Declare the Permissions a projection observes",
// arrival-inspection ADR 0001). Named rather than inlined at the assertion so both halves of the
// payload-conditional rule are discoverable in one place
// (guides/server-error-handling.md §1, code-review-back-end-2026-09-09.md).
export const raisesRejections = (
  observedPermissionIds: readonly PermissionId[],
): boolean => includes(observedPermissionIds, PermissionId.REJECTIONS_CREATE);

// AC-21/AC-22/sad.md §10 "Redaction unit" — which of the two forms a read came back in.
//
// The discriminator is the **presence of the `rejections` property**, because the withheld form is
// built by not selecting the columns that carry it: there is no flag to read, and asking for one
// would mean constructing the very property whose absence is the redaction. Both unions are
// discriminated the same way — the repository's read shape and the domain account it becomes — so
// both get the question, and neither mapper spells `'rejections' in x` out again.
export const readDisclosesRejectionCause = (
  ending: PurchaseDraftLineEndingRead,
): ending is PurchaseDraftLineEndingWithCauseRead => 'rejections' in ending;

export const accountDisclosesRejectionCause = (
  condition: LineConditionAccount,
): condition is LineConditionWithCause => 'rejections' in condition;
