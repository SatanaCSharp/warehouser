import { Maybe } from '@warehouser/shared-types/utils';

export function isUndefined<T>(value: Maybe<T>): value is undefined {
  return value === undefined;
}
