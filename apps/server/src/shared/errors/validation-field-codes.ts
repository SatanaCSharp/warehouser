import { isEmpty, isUndefined } from '@warehouser/utils/predicates';
import { holdsNoEntries } from 'shared/predicates/collection.predicates';
import { isZodValidationException } from 'shared/predicates/typed-error.predicates';
import {
  isBeyondFieldCap,
  isIssueList,
  isSafeSegment,
  isTypeMismatchIssue,
  isValueAbsent,
  outranksHeldCode,
} from 'shared/predicates/validation-field-code.predicates';
import { isString } from 'shared/predicates/value-shape.predicates';
/**
 * The fixed set of normalized codes a rejected request field can carry. It is a
 * closed vocabulary on purpose: the web maps `(code, field)` to its own copy, so
 * the wire must never carry a Zod message, the value that failed, or the type
 * that was expected — only which field was refused and which rule it broke
 * (AC-02, AC-02a, AC-09, AC-09a: the member is told which value is not accepted).
 */
export type ValidationFieldCode =
  'invalid' | 'notMultipleOf' | 'required' | 'tooBig' | 'tooSmall';

/** The payloads the global Zod pipe can have validated for one request. */
export interface ValidatedRequestPayloads {
  readonly body?: unknown;
  readonly params?: unknown;
  readonly query?: unknown;
}

interface ZodLikeIssue {
  readonly code?: unknown;
  readonly path?: unknown;
}

// Every Zod issue code this vocabulary names. `invalid_type` is absent because it
// splits into `required` and `invalid` below; anything unlisted — `custom`,
// `invalid_union`, `unrecognized_keys` — falls through to `invalid`.
const issueCodes: Readonly<Record<string, ValidationFieldCode>> = {
  invalid_format: 'invalid',
  invalid_value: 'invalid',
  not_multiple_of: 'notMultipleOf',
  too_big: 'tooBig',
  too_small: 'tooSmall',
};

const toSafePath = (
  path: unknown,
): ReadonlyArray<number | string> | undefined =>
  Array.isArray(path) && !isEmpty(path) && path.every(isSafeSegment)
    ? path
    : undefined;

const normalizeIssue = (
  issue: ZodLikeIssue,
  request: ValidatedRequestPayloads,
  path: readonly unknown[],
): ValidationFieldCode => {
  if (isTypeMismatchIssue(issue.code)) {
    return isValueAbsent(request, path) ? 'required' : 'invalid';
  }

  return isString(issue.code)
    ? (issueCodes[issue.code] ?? 'invalid')
    : 'invalid';
};

const recordIssue = (
  fields: Map<string, ValidationFieldCode>,
  candidate: unknown,
  request: ValidatedRequestPayloads,
): void => {
  const issue = candidate as ZodLikeIssue;
  const path = toSafePath(issue.path);
  if (isUndefined(path)) {
    // A whole-body refusal (a cross-field `refine`, an unrecognized key) names
    // no form field, so it stays a message-only refusal.
    return;
  }

  const field = path.join('.');
  const held = fields.get(field);
  if (isBeyondFieldCap(fields, held)) {
    return;
  }

  const code = normalizeIssue(issue, request, path);
  if (outranksHeldCode(code, held)) {
    fields.set(field, code);
  }
};

// Accumulates into one `Map` it mutates, rather than spreading a fresh object per
// issue. The spread copied the whole accumulator on every issue, which is
// quadratic in the number of issues, and the issue count is caller-controlled: an
// unbounded request array admits tens of thousands of elements within a modest
// body limit, and each malformed element carries an issue per property. NestJS
// runs guards *before* pipes, so the write rate limiter never sees the first such
// request — the whole cost lands on the event loop, synchronously, before any
// route code runs. Linear accumulation plus `maxFields` is what keeps that cost
// proportional to the request instead of to its square.
const collectFields = (
  issues: readonly unknown[],
  request: ValidatedRequestPayloads,
): ReadonlyMap<string, ValidationFieldCode> => {
  const fields = new Map<string, ValidationFieldCode>();

  for (const candidate of issues) {
    recordIssue(fields, candidate, request);
  }

  return fields;
};

/**
 * Turns a Zod request-validation failure into the flat `Record<dottedPath, code>`
 * the `request.invalid` envelope carries as `details.fields`. Returns `undefined`
 * for every other exception — including every other `HttpException` — so nothing
 * but a validation refusal gains a `details` object. At most `maxFields` fields
 * are named, however many the schema refused.
 */
export const validationFieldCodes = (
  exception: unknown,
  request: ValidatedRequestPayloads,
): Readonly<Record<string, ValidationFieldCode>> | undefined => {
  if (!isZodValidationException(exception)) {
    return undefined;
  }

  const error = exception.getZodError();
  if (!isIssueList(error)) {
    return undefined;
  }

  const fields = collectFields(error.issues, request);

  return holdsNoEntries(fields) ? undefined : Object.fromEntries(fields);
};
