import { workspaceRoleNameValidationKey } from 'modules/access/utils/workspace-role-name-validation';
import { warehouseNameValidationKey } from 'modules/workspace/utils/warehouse-name-validation';
import type { ApiFailure } from 'shared/api/client/api-client';
import { describe, expect, it } from 'vitest';

// RED for T61/AC-08, AC-15a (review S1-12) — every name rejection is produced
// by one shared value object, and all three server commands map its
// "Name must not be empty" assertion to the rule key `empty`
// (`access-name.ts`; `create-warehouse.command.ts`,
// `create-workspace-role.command.ts`, `rename-workspace.command.ts`). The web
// maps `blank`, a key the server never emits, so an empty name fell through
// to each map's fallback: "unsupported character" for a Warehouse, and the
// raw string `empty` — which is not a translation key — for a Role.
//
// The Warehouse half of `modules/workspace/hooks/name-validation.spec.ts`,
// colocated with its subject by the `modules-level-refactor` change request
// (CH-W1). The last case is parameterised over both validators, so it is
// declared once, here, rather than duplicated across the two halves: it is one
// case title, and duplicating it would report a case this split never added.
describe('name rejection rule keys', () => {
  // The mapper runs as the endpoint's `transformErrorResponse`, so what it
  // reads is the normalized API failure, not the outcome a form later sees.
  const failure = (rule: string): ApiFailure => ({
    code: 'workspace.invalid_input',
    fieldErrors: { name: rule },
  });

  it.each([
    ['empty', 'warehouseName.required'],
    ['grapheme_length', 'warehouseName.lengthRange'],
    ['control_or_format_character', 'warehouseName.unsupportedCharacter'],
  ])(
    'AC-08: translates the Warehouse-name rule %s to its own validation key',
    (rule, key) => {
      expect(warehouseNameValidationKey(failure(rule))).toMatchObject({
        fieldErrors: { name: key },
      });
    },
  );

  // A rule the web does not know must still resolve to a real translation
  // key. Passing the server's raw string through renders the code itself.
  it.each([
    [
      'Warehouse',
      warehouseNameValidationKey,
      [
        'warehouseName.required',
        'warehouseName.lengthRange',
        'warehouseName.unsupportedCharacter',
      ],
    ],
    [
      'Workspace Role',
      workspaceRoleNameValidationKey,
      [
        'workspaceRoleName.required',
        'workspaceRoleName.lengthRange',
        'workspaceRoleName.unsupportedCharacter',
        'workspaceRoleName.server',
      ],
    ],
  ])(
    'never surfaces an unrecognised %s rule as a raw translation key',
    (_name, translate, knownKeys) => {
      const result = translate(failure('a_rule_added_later'));

      expect(result.fieldErrors?.name).not.toBe('a_rule_added_later');
      expect(knownKeys).toContain(result.fieldErrors?.name);
    },
  );
});
