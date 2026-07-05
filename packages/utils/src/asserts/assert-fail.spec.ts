import { AssertionError } from '@warehouser/shared-types/errors';
import { assertFail } from 'asserts/assert-fail';

describe('assertFail', () => {
  it('throws AssertionError with default message', () => {
    expect(() => assertFail()).toThrow(AssertionError);
    expect(() => assertFail()).toThrow('Assertion fail error');
  });

  it('throws provided custom error when message is an Error', () => {
    const error = new AssertionError('custom fail error');

    expect(() => assertFail(error)).toThrow(error);
  });
});
