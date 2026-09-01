import { ZodValidationException } from 'nestjs-zod';

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

// When several issues land on one path, the lower rank wins, and an equal rank
// keeps the first issue Zod reported. A missing value outranks every rule about
// its contents — there is no point telling a member a value is too small when
// they have not supplied one — and the generic `invalid` never displaces a code
// that names an actual rule.
const codeRanks: Readonly<Record<ValidationFieldCode, number>> = {
  invalid: 2,
  notMultipleOf: 1,
  required: 0,
  tooBig: 1,
  tooSmall: 1,
};

// The most fields one refusal ever names. A member corrects a form, not a data
// set: past a few dozen named fields the envelope has stopped being something
// anyone can act on, and every further entry is only weight on the wire. It is a
// safety bound, not a UX decision, and it deliberately bounds *how many* fields
// are named without touching *which code* any named field carries — see
// `collectFields`.
const maxFields = 50;

// A path segment reaches the client, so only schema-authored field names and
// array indices may form one. Anything else — a key echoed back from the request,
// as a record schema would produce — is dropped rather than reflected.
//
// The guard this pattern gives is stronger than the fact that saves us today. No
// request schema currently uses `z.record`, `.catchall()` or `.passthrough()`, so
// no caller-supplied key can become a path segment at all; but that is a property
// of the schemas as they stand, not of this module. The day a body schema does
// carry caller-chosen keys, this pattern is the only thing between those keys and
// the response — so it stays deliberately narrow (an identifier-shaped name, no
// separators, no punctuation, no whitespace) and any key that is not
// schema-shaped is dropped rather than reflected back to its sender.
const fieldNamePattern = /^[a-z][a-z0-9]*$/iu;

const isSafeSegment = (segment: unknown): segment is number | string =>
  typeof segment === 'number'
    ? Number.isSafeInteger(segment) && segment >= 0
    : typeof segment === 'string' && fieldNamePattern.test(segment);

const toSafePath = (
  path: unknown,
): ReadonlyArray<number | string> | undefined =>
  Array.isArray(path) && path.length > 0 && path.every(isSafeSegment)
    ? path
    : undefined;

const valueAtPath = (payload: unknown, path: readonly unknown[]): unknown =>
  path.reduce<unknown>(
    (current, segment) =>
      current === null || typeof current !== 'object'
        ? undefined
        : (current as Record<string, unknown>)[String(segment)],
    payload,
  );

// Zod v4 strips the offending input from a finalized issue and states "received
// undefined" only inside the human message, so whether a value was supplied at
// all is read from the request instead of from the issue: a value is missing when
// every payload the pipe could have validated has nothing (or null) at that path.
const isValueAbsent = (
  request: ValidatedRequestPayloads,
  path: readonly unknown[],
): boolean =>
  [request.body, request.query, request.params].every((payload) => {
    const value = valueAtPath(payload, path);

    return value === undefined || value === null;
  });

const normalizeIssue = (
  issue: ZodLikeIssue,
  request: ValidatedRequestPayloads,
  path: readonly unknown[],
): ValidationFieldCode => {
  if (issue.code === 'invalid_type') {
    return isValueAbsent(request, path) ? 'required' : 'invalid';
  }

  return typeof issue.code === 'string'
    ? (issueCodes[issue.code] ?? 'invalid')
    : 'invalid';
};

const isIssueList = (error: unknown): error is { issues: readonly unknown[] } =>
  typeof error === 'object' &&
  error !== null &&
  Array.isArray((error as { issues?: unknown }).issues);

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
    const issue = candidate as ZodLikeIssue;
    const path = toSafePath(issue.path);
    if (path === undefined) {
      // A whole-body refusal (a cross-field `refine`, an unrecognized key) names
      // no form field, so it stays a message-only refusal.
      continue;
    }

    const field = path.join('.');
    const held = fields.get(field);

    // The cap turns away *new* fields only. A field already named still runs the
    // rank tie-break below against every remaining issue, so the code it ends up
    // carrying is the same ranked winner it would carry with no cap at all —
    // which of the five codes a field gets never depends on where the cap falls.
    if (held === undefined && fields.size >= maxFields) {
      continue;
    }

    const code = normalizeIssue(issue, request, path);
    if (held === undefined || codeRanks[code] < codeRanks[held]) {
      fields.set(field, code);
    }
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
  if (!(exception instanceof ZodValidationException)) {
    return undefined;
  }

  const error = exception.getZodError();
  if (!isIssueList(error)) {
    return undefined;
  }

  const fields = collectFields(error.issues, request);

  return fields.size === 0 ? undefined : Object.fromEntries(fields);
};
