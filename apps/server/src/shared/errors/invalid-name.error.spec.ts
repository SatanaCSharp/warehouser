import { ErrorCode } from '@warehouser/shared-types/enums';
import { AssertionError } from '@warehouser/shared-types/errors';
import { AccessName } from 'shared/domain/value-objects/access-name';
import {
  validatedName,
  workspaceInvalidNameError,
} from 'shared/errors/invalid-name.error';

// AC-08 / AC-15a / AC-29a are one rule set: Warehouse, Workspace Role and
// Workspace names share `AccessName`, so the assertion-to-rule mapping is
// pinned once here rather than in each of the three naming commands' specs.
/** The rejection `validatedName` raised, as a value the assertions can read. */
const rejectionOf = (create: () => string): unknown => {
  try {
    validatedName(create);
  } catch (error) {
    return error;
  }
  throw new Error('expected the name to be rejected');
};

describe('name rejection classification', () => {
  it.each([
    ['', 'empty'],
    ['a'.repeat(101), 'grapheme_length'],
    ['bad\u0007name', 'control_or_format_character'],
  ])('names the rule a rejected name broke (%#)', (input, rule) => {
    expect(rejectionOf(() => AccessName.create(input).value)).toMatchObject({
      code: ErrorCode.WORKSPACE_INVALID_INPUT,
      details: { field: 'name', rule },
    });
  });

  it('returns the trimmed value when every rule holds', () => {
    expect(validatedName(() => AccessName.create('  Central DC  ').value)).toBe(
      'Central DC',
    );
  });

  // An assertion this build's table does not know must still resolve to a real
  // rule string; leaking the assertion message would put internal wording in a
  // client response.
  it('resolves an unrecognised assertion to a generic rule', () => {
    expect(
      rejectionOf(() => {
        throw new AssertionError('Name must rhyme');
      }),
    ).toMatchObject({ details: { field: 'name', rule: 'invalid' } });
  });

  // Only assertions are business rejections; anything else is a defect and
  // must stay one (server-error-handling.md section 2).
  it('propagates a non-assertion failure unchanged', () => {
    const failure = new TypeError('segmenter unavailable');

    expect(() =>
      validatedName(() => {
        throw failure;
      }),
    ).toThrow(failure);
  });

  it('builds the field-scoped rejection every naming command shares', () => {
    expect(workspaceInvalidNameError('empty')).toMatchObject({
      code: ErrorCode.WORKSPACE_INVALID_INPUT,
      details: { field: 'name', rule: 'empty' },
    });
  });
});
