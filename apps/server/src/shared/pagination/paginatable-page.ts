export interface PaginatablePage<T> {
  readonly items: T[];
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
  readonly nextCursor: string | null;
}

export const paginatablePage = <T extends { readonly id: string }>(
  rows: readonly T[],
  limit: number,
  hasPreviousCursor: boolean,
): PaginatablePage<T> => {
  const items = rows.slice(0, limit);

  return {
    items,
    hasNext: rows.length > limit,
    hasPrev: hasPreviousCursor,
    nextCursor:
      rows.length > limit && items.length > 0
        ? items[items.length - 1].id
        : null,
  };
};
