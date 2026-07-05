import { AssertionError } from '@warehouser/shared-types/errors';
import { assertDefined } from 'asserts/assert-defined';

describe('assertDefined', () => {
  it('does not throw when value is defined', () => {
    const value: string | null = 'defined';

    expect(() => assertDefined(value)).not.toThrow();
  });

  it('throws AssertionError with default message when value is null', () => {
    expect(() => assertDefined(null)).toThrow(AssertionError);
    expect(() => assertDefined(null)).toThrow('Expected value to be defined');
  });

  it('throws custom error when value is undefined and custom Error is provided', () => {
    const error = new Error('custom defined error');

    expect(() => assertDefined(undefined, error)).toThrow(error);
  });

  it('throws error from factory when value is undefined and factory is provided', () => {
    const errorFactory = (): Error => new Error('factory defined error');

    expect(() => assertDefined(undefined, errorFactory)).toThrow(
      'factory defined error',
    );
  });
});
