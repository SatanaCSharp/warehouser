import { normalizeEmail } from 'shared/domain/security/is-supported-email';

// What the sign-up and sign-in surfaces will accept as a credential (server-error-handling.md §1).
// Refusing a value that fails one of these is the command's job; these only answer.

const emailPattern =
  /^(?=[^@]{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;

/** ASCII only, at most 254 characters after normalization, and shaped like an address. */
export const isSupportedEmail = (email: string): boolean => {
  const normalized = normalizeEmail(email);
  const isAscii = Array.from(normalized).every(
    (character) => character.codePointAt(0)! <= 127,
  );

  return isAscii && normalized.length <= 254 && emailPattern.test(normalized);
};

/** Counted in code points rather than UTF-16 units, so an astral character costs one. */
export const isSupportedPassword = (password: string): boolean => {
  const length = Array.from(password).length;

  return length >= 8 && length <= 128;
};

// Whether a stored credential was derived with the algorithm this module can verify. A credential
// written by an older or future scheme is not wrong, it is simply not verifiable here — asked
// rather than compared so adding a second scheme is one list rather than a hunt for `!== 'scrypt'`.
export const isVerifiableAlgorithm = (algorithm: string): boolean =>
  algorithm === 'scrypt';

// Whether the submitted password reproduced the stored credential. `verifyPassword` is asynchronous
// — it derives a key — so its answer reaches the assertion as a value rather than as the call, and
// this is the name that answer is asked under (server-error-handling.md §1: the predicate stays
// independent of the error the assertion raises).
export const matchesStoredCredential = (verified: boolean): boolean => verified;
