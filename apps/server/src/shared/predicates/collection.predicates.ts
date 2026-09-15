/** Questions about how much a collection holds, for the cases `isEmpty` in
 * `@warehouser/utils/predicates` does not already answer.
 *
 * `isEmpty` covers anything with a `length`, which is most of them. What is left is a `Map` or `Set`
 * (sized, not lengthed), and the three comparisons that ask about a size rather than about
 * emptiness — a page overfetch, two lists agreeing, and a collection holding exactly one. */

/** Whether a keyed collection holds nothing. The `length`-shaped counterpart is `isEmpty`. */
export const holdsNoEntries = (collection: {
  readonly size: number;
}): boolean => collection.size === 0;

/** Whether a read fetched past its page, which is how a cursor pager learns there is a next page
 * without counting the whole set: select `limit + 1` rows and ask. */
export const overfetchedPage = (
  rows: { readonly length: number },
  limit: number,
): boolean => rows.length > limit;

/** Whether two collections hold the same number of things.
 *
 * Asked where a read is expected to resolve every identifier it was given: fewer rows back than ids
 * in means at least one id named nothing, without needing to work out which. */
export const haveSameSize = (
  left: { readonly length: number },
  right: { readonly length: number },
): boolean => left.length === right.length;

/** Whether a collection holds exactly one thing — the case where "the only one" is a meaningful
 * answer rather than an arbitrary pick. */
export const holdsExactlyOne = (collection: {
  readonly length: number;
}): boolean => collection.length === 1;
