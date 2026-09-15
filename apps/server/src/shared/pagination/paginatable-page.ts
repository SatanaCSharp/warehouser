import { isEmpty } from '@warehouser/utils/predicates';
import { overfetchedPage } from 'shared/predicates/collection.predicates';

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

  // The read selects `limit + 1` rows, so fetching past the page is how the pager learns there is a
  // next one without counting the whole set. Asked once, here, rather than restated beside the
  // cursor it also decides.
  if (!overfetchedPage(rows, limit)) {
    return {
      items,
      hasNext: false,
      hasPrev: hasPreviousCursor,
      nextCursor: null,
    };
  }

  return {
    items,
    hasNext: true,
    hasPrev: hasPreviousCursor,
    // A page that overfetched but kept nothing has no row to cursor from — `limit` of zero.
    nextCursor: isEmpty(items) ? null : items[items.length - 1].id,
  };
};
