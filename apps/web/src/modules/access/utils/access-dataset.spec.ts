import { describe, expect, it } from 'vitest';

import { toAccessDataset } from 'modules/access/utils/access-dataset';

type Item = { id: string };

const item: Item = { id: '00000000-0000-4000-8000-000000000001' };

describe('toAccessDataset', () => {
  // CR-AC-09 / CH-09 — the flattened dataset reports what it has and whether
  // the read failed. `isFetching`, `isLoading` and `isReady` are gone: the
  // route loader has already awaited the read, so a caller has nothing left to
  // branch on.
  it('reports exactly the items and whether the read failed (CR-AC-09)', () => {
    const dataset = toAccessDataset<Item>({
      data: { items: [item] },
      isError: false,
    });

    expect(Object.keys(dataset).sort()).toEqual(['isError', 'items']);
  });

  // CR-AC-09's second clause — `isError` is NOT removed. It is the term both
  // tab guards now depend on, so a permitted actor whose read failed is told
  // instead of shown an empty directory (CR-AC-15).
  it('retains the failure of the read (CR-AC-09, CR-AC-15)', () => {
    expect(toAccessDataset<Item>({ isError: true }).isError).toBe(true);
    expect(
      toAccessDataset<Item>({ data: { items: [item] }, isError: false })
        .isError,
    ).toBe(false);
  });

  it('flattens the page envelope so no caller unwraps it', () => {
    expect(
      toAccessDataset<Item>({ data: { items: [item] }, isError: false }).items,
    ).toEqual([item]);
  });

  // An absent envelope is an empty list, exactly as it was before CH-09: the
  // dataset a caller never requested carries no items rather than `undefined`.
  it('reports no items when the read was skipped or has not arrived', () => {
    expect(toAccessDataset<Item>({ isError: false }).items).toEqual([]);
  });
});
