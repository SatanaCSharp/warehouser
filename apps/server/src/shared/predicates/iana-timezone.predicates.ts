// Pure predicate for `APP_TIMEZONE` (server-error-handling.md §1). It reads a declared value and
// answers a question about it; refusing a value that fails it is
// `shared/config/app-timezone.config.ts`'s job, not this one's. It lives here rather than under one
// feature's `predicates/` because `data-model.md § Time, timezone and the week` binds the value it
// validates into more than one server feature's repositories (T5+).

/** Whether `value` names a real IANA timezone `Intl` can resolve.
 *
 * `Intl.DateTimeFormat` throws a `RangeError` for a zone name ICU's timezone database does not
 * recognize, and otherwise performs no I/O or mutation — constructing it and discarding the result
 * is the standard total check for "is this a real zone name". */
export const isValidIanaTimezone = (value: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
