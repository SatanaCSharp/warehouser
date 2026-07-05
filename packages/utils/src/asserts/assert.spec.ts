import { AssertionError } from '@warehouser/shared-types/errors';
import { assert } from 'asserts/assert';

describe('assert', () => {
  it('does not throw when condition is true', () => {
    expect(() => assert(true, 'message')).not.toThrow();
  });

  it('throws AssertionError with provided message when condition is false and message is string', () => {
    const message = 'test assertion error';

    expect(() => assert(false, message)).toThrow(AssertionError);
    expect(() => assert(false, message)).toThrow(message);
  });

  it('throws provided error instance when condition is false and message is an Error', () => {
    const error = new Error('custom error');

    expect(() => assert(false, error)).toThrow(error);
  });

  it('throws error created by factory when condition is false and message is a function', () => {
    const errorFactory = (): Error => new Error('factory error');

    expect(() => assert(false, errorFactory)).toThrow('factory error');
  });
});
