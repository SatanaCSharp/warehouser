/** The invariants a Session and its digest hold, as questions rather than as comparisons written
 * into the `assert` that enforces them (server-error-handling.md §1 keeps the two apart, so the
 * condition stays askable in a check that does not throw). */

/** Whether a moment falls at or after the Session was established. A Session cannot be revoked
 * before it existed; equality is allowed, because establishing and revoking within the same clock
 * tick is a real sequence rather than a broken one. */
export const isAtOrAfterEstablishment = (
  at: Date,
  establishedAt: Date,
): boolean => at >= establishedAt;

/** Whether a digest is exactly the width the session scheme fixes. Not a range: a digest of any
 * other length is a different scheme's, not a malformed one of this scheme's. */
export const isSessionDigestWidth = (
  byteLength: number,
  expectedLength: number,
): boolean => byteLength === expectedLength;
