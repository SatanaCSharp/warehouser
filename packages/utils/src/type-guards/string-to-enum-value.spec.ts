import { stringToEnumValue } from 'type-guards';

enum TestEnum {
  FOO = 'FOO',
  BAR = 'BAR',
}

describe('stringToEnumValue', () => {
  it('returns enum value when string matches enum member value', () => {
    const result = stringToEnumValue('FOO', TestEnum);

    expect(result).toBe(TestEnum.FOO);
  });

  it('maintains enum type in return value', () => {
    const value = stringToEnumValue('BAR', TestEnum);

    const acceptsEnum = (v: TestEnum): TestEnum => v;

    expect(acceptsEnum(value)).toBe(TestEnum.BAR);
  });

  it('throws TypeError when value is not part of enum values', () => {
    // Using unknown value should cause assertion failure
    expect(() => stringToEnumValue('BAZ', TestEnum)).toThrow(TypeError);
    expect(() => stringToEnumValue('BAZ', TestEnum)).toThrow(
      'Passed value is not enum compatible one',
    );
  });
});
