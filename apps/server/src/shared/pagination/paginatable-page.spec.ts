import { paginatablePage } from 'shared/pagination/paginatable-page.js';
import { describe, expect, it } from 'vitest';

describe('paginatablePage', () => {
  it('returns a bounded page and derives the next cursor from the last item', () => {
    const page = paginatablePage(
      [{ id: 'first' }, { id: 'second' }, { id: 'overflow' }],
      2,
      true,
    );

    expect(page).toEqual({
      items: [{ id: 'first' }, { id: 'second' }],
      hasNext: true,
      hasPrev: true,
      nextCursor: 'second',
    });
  });
});
