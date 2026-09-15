/** Reading the session cookie out of a raw `Cookie` header.
 *
 * The header is a `;`-separated list of `name=value` pairs, so finding one cookie in it is three
 * questions — does this part state a value at all, is the name the one wanted, and is there a header
 * to read. Named here rather than at the loop, so the parse reads as what it is doing.
 *
 * The cookie's name is an argument rather than imported: the constant lives beside the REST adapter
 * that writes the cookie, and a domain predicate must not reach up into `rest/`. */

/** Whether a `Cookie` header part states a `name=value` pair. `indexOf` reports a part with no `=`
 * as `-1`, which is a part carrying no value rather than one whose value is empty. */
export const statesCookieValue = (separatorIndex: number): boolean =>
  separatorIndex >= 0;

/** Whether this part's name is the cookie being looked for. */
export const namesCookie = (name: string, wanted: string): boolean =>
  name === wanted;
