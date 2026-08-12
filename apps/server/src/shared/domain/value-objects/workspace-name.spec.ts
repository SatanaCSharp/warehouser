import { AssertionError } from '@warehouser/shared-types/errors';
import { WorkspaceName } from 'shared/domain/value-objects/workspace-name';

// Built from code points rather than written as literals: a combining mark, a
// control character and a format character are invisible in source and are
// easily normalized or stripped by an editor, which would quietly defeat the
// rule each one is here to prove.
const COMPOSED_E_ACUTE = `Caf${String.fromCodePoint(0x00e9)}`;
const DECOMPOSED_E_ACUTE = `Cafe${String.fromCodePoint(0x0301)}`;
const BELL = String.fromCodePoint(0x0007);
const SOFT_HYPHEN = String.fromCodePoint(0x00ad);

describe('WorkspaceName', () => {
  describe('the unset state', () => {
    it('carries no name', () => {
      const name = WorkspaceName.unset();

      expect(name.isSet).toBe(false);
      expect(name.value).toBeNull();
    });

    it('is distinct from a whitespace-only name, which is refused outright', () => {
      expect(WorkspaceName.unset().isSet).toBe(false);
      expect(() => WorkspaceName.create('   ')).toThrow(AssertionError);
    });

    it('reconstitutes an unnamed Workspace from stored null', () => {
      const name = WorkspaceName.fromStored(null);

      expect(name.isSet).toBe(false);
      expect(name.value).toBeNull();
    });

    it('reconstitutes a named Workspace from its stored name', () => {
      const name = WorkspaceName.fromStored('Northern Depot');

      expect(name.isSet).toBe(true);
      expect(name.value).toBe('Northern Depot');
    });
  });

  describe('naming a Workspace', () => {
    it('stores the trimmed name', () => {
      const name = WorkspaceName.create('  Northern Depot  ');

      expect(name.isSet).toBe(true);
      expect(name.value).toBe('Northern Depot');
    });

    it('preserves the submitted Unicode without normalization', () => {
      expect(WorkspaceName.create(DECOMPOSED_E_ACUTE).value).toBe(
        DECOMPOSED_E_ACUTE,
      );
      expect(WorkspaceName.create(DECOMPOSED_E_ACUTE).value).not.toBe(
        COMPOSED_E_ACUTE,
      );
    });

    it('rejects a name that is empty after trimming', () => {
      expect(() => WorkspaceName.create('   ')).toThrow(
        'Name must not be empty',
      );
    });

    it('accepts exactly 100 user-perceived characters', () => {
      expect(WorkspaceName.create('a'.repeat(100)).value).toHaveLength(100);
    });

    it('rejects a name longer than 100 user-perceived characters', () => {
      expect(() => WorkspaceName.create('a'.repeat(101))).toThrow(
        'Name must contain at most 100 user-perceived characters',
      );
    });

    it('rejects control characters', () => {
      expect(() => WorkspaceName.create(`Northern${BELL}Depot`)).toThrow(
        'Name must not contain control or format characters',
      );
    });

    it('rejects format characters', () => {
      expect(() => WorkspaceName.create(`Northern${SOFT_HYPHEN}Depot`)).toThrow(
        'Name must not contain control or format characters',
      );
    });
  });
});
