import { assert } from 'asserts/assert';

type EnumConstraint = Record<string, string>;

export function stringToEnumValue<TEnum extends EnumConstraint>(
  value: string,
  enumObj: TEnum,
): TEnum[keyof TEnum] {
  const enumValuesSet = new Set(Object.values(enumObj));

  assert(
    enumValuesSet.has(value),
    new TypeError('Passed value is not enum compatible one'),
  );

  return value as TEnum[keyof TEnum];
}
