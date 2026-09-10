import { paginationBuilder } from 'shared/pagination/pagination-builder.js';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';

describe('paginationBuilder', () => {
  it('adds both cursor bounds to the supplied query builder', () => {
    const builder = {
      andWhere: vi.fn().mockReturnThis(),
    } as unknown as SelectQueryBuilder<ObjectLiteral>;

    const result = paginationBuilder(
      builder,
      'record.id',
      'after-id',
      'before-id',
    );

    expect(result).toBe(builder);
    expect(builder.andWhere).toHaveBeenNthCalledWith(1, 'record.id > :after', {
      after: 'after-id',
    });
    expect(builder.andWhere).toHaveBeenNthCalledWith(2, 'record.id < :before', {
      before: 'before-id',
    });
  });
});
