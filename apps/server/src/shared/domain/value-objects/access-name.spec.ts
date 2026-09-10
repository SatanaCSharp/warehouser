import { AssertionError } from '@warehouser/shared-types/errors';
import { AccessName } from 'shared/domain/value-objects/access-name';
import { describe, expect, it } from 'vitest';

// Built from code points rather than written as literals: a combining mark, a
// control character and a format character are invisible in source and are
// easily normalized or stripped by an editor, which would quietly defeat the
// rule each one is here to prove.
const COMPOSED_E_ACUTE = `Caf${String.fromCodePoint(0x00e9)}`;
const DECOMPOSED_E_ACUTE = `Cafe${String.fromCodePoint(0x0301)}`;
const BELL = String.fromCodePoint(0x0007);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);
// A single non-BMP emoji: one user-perceived character built from two UTF-16
// code units. Deliberately not a ZWJ sequence -- the joiner is itself a format
// character, so an emoji family is refused by the control/format rule.
const GRINNING_FACE = String.fromCodePoint(0x1f600);

describe('AccessName', () => {
  it('stores the trimmed name', () => {
    expect(AccessName.create('  Warehouse Managers  ').value).toBe(
      'Warehouse Managers',
    );
  });

  it('preserves the submitted Unicode without normalization', () => {
    // The same grapheme composed (U+00E9) vs. decomposed (e + U+0301): storing
    // must not fold one into the other, so what the member submitted is what
    // other members read back.
    expect(AccessName.create(COMPOSED_E_ACUTE).value).toBe(COMPOSED_E_ACUTE);
    expect(AccessName.create(DECOMPOSED_E_ACUTE).value).toBe(
      DECOMPOSED_E_ACUTE,
    );
    expect(AccessName.create(DECOMPOSED_E_ACUTE).value).not.toBe(
      COMPOSED_E_ACUTE,
    );
  });

  it('rejects a name that is empty after trimming', () => {
    expect(() => AccessName.create('   ')).toThrow(AssertionError);
    expect(() => AccessName.create('   ')).toThrow('Name must not be empty');
  });

  it('accepts exactly 100 user-perceived characters', () => {
    expect(AccessName.create('a'.repeat(100)).value).toHaveLength(100);
  });

  it('counts user-perceived characters rather than code units', () => {
    // One emoji is a single grapheme built from two UTF-16 code units, so a
    // code-unit limit would reject a name well within the rule.
    expect(() => AccessName.create(GRINNING_FACE.repeat(100))).not.toThrow();
    expect(() => AccessName.create(GRINNING_FACE.repeat(101))).toThrow(
      'Name must contain at most 100 user-perceived characters',
    );
  });

  it('rejects a name longer than 100 user-perceived characters', () => {
    expect(() => AccessName.create('a'.repeat(101))).toThrow(
      'Name must contain at most 100 user-perceived characters',
    );
  });

  it('rejects control characters', () => {
    expect(() => AccessName.create(`Ware${BELL}house`)).toThrow(
      'Name must not contain control or format characters',
    );
  });

  it('rejects format characters', () => {
    expect(() => AccessName.create(`Ware${SOFT_HYPHEN}house`)).toThrow(
      'Name must not contain control or format characters',
    );
  });

  describe('conflictsWith', () => {
    it('reports an exact match as a conflict', () => {
      expect(
        AccessName.create('Pickers').conflictsWith([
          AccessName.create('Packers'),
          AccessName.create('Pickers'),
        ]),
      ).toBe(true);
    });

    it('treats differently cased names as distinct', () => {
      expect(
        AccessName.create('Pickers').conflictsWith([
          AccessName.create('pickers'),
          AccessName.create('PICKERS'),
        ]),
      ).toBe(false);
    });

    it('reports no conflict against an empty set', () => {
      expect(AccessName.create('Pickers').conflictsWith([])).toBe(false);
    });
  });
});
