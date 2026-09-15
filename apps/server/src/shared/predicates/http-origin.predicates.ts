// Pure predicates for the HTTP platform configuration (server-error-handling.md §1). They read a
// declared value and answer a question about it; refusing a value that fails one of them is
// `shared/config/http-platform.config.ts`'s job, not theirs.

const isHttpProtocol = (url: URL): boolean =>
  url.protocol === 'http:' || url.protocol === 'https:';

const carriesNoCredentials = (url: URL): boolean =>
  url.username === '' && url.password === '';

/** An origin and nothing else: scheme, host and port, with no path, query, fragment or userinfo —
 * `url.origin === value` is what rejects everything after the authority. */
const isBareHttpOrigin = (url: URL, value: string): boolean =>
  isHttpProtocol(url) && url.origin === value && carriesNoCredentials(url);

export const isHttpOrigin = (value: string): boolean => {
  try {
    return isBareHttpOrigin(new URL(value), value);
  } catch {
    // An unparseable string is not an origin. Catching here keeps the predicate total — it answers
    // for every string rather than throwing at its caller.
    return false;
  }
};
