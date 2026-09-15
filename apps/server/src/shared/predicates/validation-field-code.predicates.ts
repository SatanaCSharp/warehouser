import { isDefined, isNull, isUndefined } from '@warehouser/utils/predicates';
import type {
  ValidatedRequestPayloads,
  ValidationFieldCode,
} from 'shared/errors/validation-field-codes';
import {
  isNumber,
  isObjectLike,
  isString,
} from 'shared/predicates/value-shape.predicates';

// Pure predicates for request-validation field codes (server-error-handling.md §1). The two types
// they read are imported type-only from `shared/errors/validation-field-codes.ts`, which imports
// these back as values — the edge that exists at runtime runs one way only, from the errors module
// to here. Each constant and helper below is owned by exactly one predicate and travelled with it.

// When several issues land on one path, the lower rank wins, and an equal rank keeps the first
// issue Zod reported. A missing value outranks every rule about its contents — there is no point
// telling a member a value is too small when they have not supplied one — and the generic `invalid`
// never displaces a code that names an actual rule.
const codeRanks: Readonly<Record<ValidationFieldCode, number>> = {
  invalid: 2,
  notMultipleOf: 1,
  required: 0,
  tooBig: 1,
  tooSmall: 1,
};

// The most fields one refusal ever names. A member corrects a form, not a data set: past a few
// dozen named fields the envelope has stopped being something anyone can act on, and every further
// entry is only weight on the wire. It is a safety bound, not a UX decision, and it deliberately
// bounds *how many* fields are named without touching *which code* any named field carries.
const maxFields = 50;

// A path segment reaches the client, so only schema-authored field names and array indices may form
// one. Anything else — a key echoed back from the request, as a record schema would produce — is
// dropped rather than reflected.
//
// The guard this pattern gives is stronger than the fact that saves us today. No request schema
// currently uses `z.record`, `.catchall()` or `.passthrough()`, so no caller-supplied key can become
// a path segment at all; but that is a property of the schemas as they stand, not of this module.
// The day a body schema does carry caller-chosen keys, this pattern is the only thing between those
// keys and the response — so it stays deliberately narrow (an identifier-shaped name, no
// separators, no punctuation, no whitespace).
const fieldNamePattern = /^[a-z][a-z0-9]*$/iu;

export const isSafeSegment = (segment: unknown): segment is number | string => {
  if (isNumber(segment)) {
    return Number.isSafeInteger(segment) && segment >= 0;
  }

  return isString(segment) && fieldNamePattern.test(segment);
};

const valueAtPath = (payload: unknown, path: readonly unknown[]): unknown =>
  path.reduce<unknown>(
    (current, segment) =>
      !isObjectLike(current)
        ? undefined
        : (current as Record<string, unknown>)[String(segment)],
    payload,
  );

// Zod v4 strips the offending input from a finalized issue and states "received undefined" only
// inside the human message, so whether a value was supplied at all is read from the request instead
// of from the issue: a value is missing when every payload the pipe could have validated has
// nothing (or null) at that path.
export const isValueAbsent = (
  request: ValidatedRequestPayloads,
  path: readonly unknown[],
): boolean =>
  [request.body, request.query, request.params].every((payload) => {
    const value = valueAtPath(payload, path);

    return isUndefined(value) || isNull(value);
  });

export const isIssueList = (
  error: unknown,
): error is { issues: readonly unknown[] } =>
  typeof error === 'object' &&
  isDefined(error) &&
  Array.isArray((error as { issues?: unknown }).issues);

// The cap turns away *new* fields only. A field already named still runs the rank tie-break against
// every remaining issue, so the code it ends up carrying is the same ranked winner it would carry
// with no cap at all — which of the five codes a field gets never depends on where the cap falls.
export const isBeyondFieldCap = (
  fields: ReadonlyMap<string, ValidationFieldCode>,
  held: ValidationFieldCode | undefined,
): boolean => isUndefined(held) && fields.size >= maxFields;

// A field named by several issues carries the highest-ranked of their codes, so the same field
// refused two ways reports the same code however the issues happen to be ordered.
export const outranksHeldCode = (
  code: ValidationFieldCode,
  held: ValidationFieldCode | undefined,
): boolean => isUndefined(held) || codeRanks[code] < codeRanks[held];

/** Whether a schema issue is the one that means "the value was the wrong type" — which, for a
 * missing property, is how Zod reports absence. It is the only issue code whose field code depends
 * on the request payload rather than on the code alone: present but wrong is `invalid`, absent is
 * `required`. */
export const isTypeMismatchIssue = (code: unknown): boolean =>
  code === 'invalid_type';
