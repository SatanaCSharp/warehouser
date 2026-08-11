/** A loaded access dataset, flattened so no caller unwraps a page envelope. */
export type AccessDataset<TItem> = {
  items: TItem[];
  isError: boolean;
  isFetching: boolean;
  /** True on the first load only; a background refresh keeps rendering items. */
  isLoading: boolean;
  /** True once the dataset has actually arrived, not merely stopped loading. */
  isReady: boolean;
};

type QueryResult<TItem> = {
  data?: { items: TItem[] };
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
};

export const toAccessDataset = <TItem>({
  data,
  isError,
  isFetching,
  isLoading,
}: QueryResult<TItem>): AccessDataset<TItem> => ({
  items: data?.items ?? [],
  isError,
  isFetching,
  isLoading,
  isReady: data !== undefined,
});
