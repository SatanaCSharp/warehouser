/**
 * A loaded access dataset, flattened so no caller unwraps a page envelope.
 *
 * CH-09 — the route loader has already awaited the read by the time anything
 * renders, so there is no readiness left to report: `isFetching`, `isLoading`
 * and `isReady` are gone (CR-AC-09). `isError` stays, because a permitted actor
 * whose read failed must be told so rather than shown an empty directory — it
 * is the term both tab guards depend on (CR-AC-15).
 */
export type AccessDataset<TItem> = {
  items: TItem[];
  isError: boolean;
};

type QueryResult<TItem> = {
  data?: { items: TItem[] };
  isError: boolean;
};

export const toAccessDataset = <TItem>({
  data,
  isError,
}: QueryResult<TItem>): AccessDataset<TItem> => ({
  items: data?.items ?? [],
  isError,
});
