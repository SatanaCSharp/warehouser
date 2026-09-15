/** Questions a shared repository asks about the options a caller handed it.
 *
 * A read's options object carries flags that narrow what it returns, and every one of them used to
 * be read as a bare `if (options.activeOnly)` — a rule whose name lived only in the property.
 * Asking it gives the same rule one spelling across the repositories that offer it. */

/** Whether the caller asked for only the rows that are still active, excluding the deactivated
 * ones. Absent means unfiltered: a read that does not ask to narrow gets everything. */
export const listsActiveOnly = (options: {
  readonly activeOnly?: boolean;
}): boolean => options.activeOnly === true;

/** Whether a write is allowed to join a transaction its caller already opened.
 *
 * Absent means yes — joining is the default, and only an explicit `false` forces the write into a
 * transaction of its own. */
export const propagatesTransaction = (options: {
  readonly propagation?: boolean;
}): boolean => options.propagation !== false;

/** Whether a Customer Order listing is ordered by when it is needed rather than by when it was
 * recorded. Asked at both listing sites, which must agree about what the selector means. */
export const ordersByNeededBy = (order: string): boolean =>
  order === 'needed_by';
