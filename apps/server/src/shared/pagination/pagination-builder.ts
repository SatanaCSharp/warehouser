import { isDefined } from '@warehouser/utils/predicates';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export const paginationBuilder = <T extends ObjectLiteral>(
  builder: SelectQueryBuilder<T>,
  column: string,
  after?: string,
  before?: string,
): SelectQueryBuilder<T> => {
  if (isDefined(after)) {
    builder.andWhere(`${column} > :after`, { after });
  }
  if (isDefined(before)) {
    builder.andWhere(`${column} < :before`, { before });
  }
  return builder;
};
