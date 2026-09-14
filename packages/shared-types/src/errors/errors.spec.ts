// Covers `src/errors/**`, which had no spec of any kind: four constructors and one message builder,
// all at 0.0% coverage, and the builder the single CRAP failure in this package.
//
// The builder is the reason this file exists. `NotImplementedError` renders its `args` into the
// message, and it renders them three different ways depending on what it was handed — so the three
// branches are the contract, not an implementation detail: a caller reading the message of a
// thrown `NotImplementedError` is reading whichever branch ran.
import { ApplicationError } from 'errors/application.error';
import { AssertionError } from 'errors/assertion.error';
import { NotImplementedError } from 'errors/not-implemented.error';
import { SystemError } from 'errors/system.error';
import { describe, expect, it } from 'vitest';

describe('NotImplementedError', () => {
  it('falls back to the default message', () => {
    expect(new NotImplementedError().message).toBe(
      'The functionality has not been implemented.',
    );
  });

  // The `!args` guard, which is what every no-argument throw site hits.
  it('renders the message alone when there are no args', () => {
    expect(new NotImplementedError('not built yet').message).toBe(
      'not built yet',
    );
  });

  // The non-object branch. `String` rather than `JSON.stringify` is deliberate — it is what keeps a
  // bare string from arriving quoted — so assert the absence of the quotes, not just the substring.
  it('stringifies a primitive arg without quoting it', () => {
    expect(new NotImplementedError('missing case', 'DRAFT').message).toBe(
      'missing case args: DRAFT ',
    );
  });

  // The object branch, which is the common one: throw sites pass the input they could not handle.
  it('serialises an object arg as JSON', () => {
    expect(
      new NotImplementedError('missing case', { id: 7, state: 'DRAFT' })
        .message,
    ).toBe('missing case args: {"id":7,"state":"DRAFT"} ');
  });

  // `0`, `''` and `false` are falsy, so they take the `!args` branch and are dropped rather than
  // rendered. That is a real edge of the guard above and worth pinning: a caller passing `0` gets
  // no `args:` segment at all.
  it('drops a falsy arg rather than rendering it', () => {
    expect(new NotImplementedError('missing case', 0).message).toBe(
      'missing case',
    );
  });
});

describe('error classes', () => {
  it('ApplicationError carries its code as the message and keeps details', () => {
    const error = new ApplicationError('items.not_found', { id: 7 });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('items.not_found');
    expect(error.code).toBe('items.not_found');
    expect(error.details).toEqual({ id: 7 });
  });

  it('ApplicationError leaves details undefined when none are given', () => {
    expect(new ApplicationError('items.not_found').details).toBeUndefined();
  });

  it('SystemError carries its code as the message and keeps its cause', () => {
    const cause = new Error('ECONNREFUSED');
    const error = new SystemError('database.unreachable', cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('database.unreachable');
    expect(error.code).toBe('database.unreachable');
    expect(error.cause).toBe(cause);
  });

  it('AssertionError passes its message through', () => {
    expect(new AssertionError('expected one row').message).toBe(
      'expected one row',
    );
  });
});
