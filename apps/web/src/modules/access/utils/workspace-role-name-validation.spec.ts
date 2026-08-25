import { describe, expect, it } from 'vitest';

import { workspaceRoleNameValidationKey } from 'modules/access/utils/workspace-role-name-validation';

import type { ApiFailure } from 'shared/api/client/api-client';

// RED for T61/AC-08, AC-15a (review S1-12) — every name rejection is produced
// by one shared value object, and all three server commands map its
// "Name must not be empty" assertion to the rule key `empty`
// (`access-name.ts`; `create-warehouse.command.ts`,
// `create-workspace-role.command.ts`, `rename-workspace.command.ts`). The web
// maps `blank`, a key the server never emits, so an empty name fell through
// to each map's fallback: "unsupported character" for a Warehouse, and the
// raw string `empty` — which is not a translation key — for a Role.
//
// The Workspace-Role half of this spec. Its Warehouse half now lives beside
// its own subject at `modules/workspace/utils/warehouse-name-validation.spec.ts`
// (`modules-level-refactor` CH-W1, re-homed by this request's CH-W2), together
// with the one case parameterised over both validators.
describe('name rejection rule keys', () => {
  // The mapper runs as the endpoint's `transformErrorResponse`, so what it
  // reads is the normalized API failure, not the outcome a form later sees.
  const failure = (rule: string): ApiFailure => ({
    code: 'workspace.invalid_input',
    fieldErrors: { name: rule },
  });

  it.each([
    ['empty', 'workspaceRoleName.required'],
    ['grapheme_length', 'workspaceRoleName.lengthRange'],
    ['control_or_format_character', 'workspaceRoleName.unsupportedCharacter'],
  ])(
    'AC-15a: translates the Workspace Role-name rule %s to its own validation key',
    (rule, key) => {
      expect(workspaceRoleNameValidationKey(failure(rule))).toMatchObject({
        fieldErrors: { name: key },
      });
    },
  );

  // The endpoint composes `workspaceRoleFieldErrors` ahead of this mapper, so
  // AC-15's exact-name conflict reaches it already keyed.
  // Re-mapping a resolved key would replace the copy that explains
  // differently cased names stay distinct with the generic server message.
  it('AC-15: leaves an already-resolved validation key untouched', () => {
    expect(
      workspaceRoleNameValidationKey({
        code: 'workspace.role_name_conflict',
        fieldErrors: { name: 'workspaceRoleName.duplicate' },
      }),
    ).toMatchObject({ fieldErrors: { name: 'workspaceRoleName.duplicate' } });
  });
});
