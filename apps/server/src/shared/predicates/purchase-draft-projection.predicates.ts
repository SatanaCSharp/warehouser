import type {
  CustomerIdentityProjection,
  RejectionCauseProjection,
} from 'shared/domain/repositories/purchase-draft-read.repository';

/** Which of the four legal shapes a Purchase Draft read is building.
 *
 * The two narrowings are independent and multiply (AC-09a × AC-22, sad.md §6.3), and each decides
 * which columns the query **selects** rather than what it filters afterwards — a redaction failure
 * is a missing SQL expression, never a forgotten `delete`
 * (server-request-authorization.md § "Consume the observed set in the projection").
 *
 * Asked of a two-valued selector rather than of a `boolean`, which is the point: the private query
 * builders take both narrowings, and as positional booleans nothing stopped a caller passing them
 * in the wrong order — the redacted read would have silently selected customer identity and the
 * compiler would have agreed. Named selectors make that swap a type error, and these predicates are
 * how the builders ask which one they were handed. */

/** Whether this read may name the Customer behind a link, the destination a Direct to Customer line
 * ships to, and both sides of the AC-18 address comparison. */
export const projectsCustomerIdentity = (
  identity: CustomerIdentityProjection,
): boolean => identity === 'identified';

/** Whether this read may name a Rejection's cause — its Reason, description, Source, Disposition
 * and amendment. The condition figures and the Pre-receipt Conformance are in the common half and
 * are not governed by this. */
export const projectsRejectionCause = (
  cause: RejectionCauseProjection,
): boolean => cause === 'with_cause';
