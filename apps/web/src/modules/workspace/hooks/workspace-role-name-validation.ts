import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

// A rejected Workspace Role name arrives as `workspace.invalid_input` naming
// the field and the rule it broke, so the member is told which rule was not met
// rather than that something was wrong (AC-15a).
const validationKeysByRule: Record<string, string> = {
  blank: 'workspaceRoleName.required',
  grapheme_length: 'workspaceRoleName.lengthRange',
  control_or_format_character: 'workspaceRoleName.unsupportedCharacter',
};

/**
 * AC-15 — a name already used exactly in the Workspace is refused as its own
 * code, and the copy states that differently cased names stay distinct, so the
 * member does not read the refusal as case-insensitive.
 */
export const workspaceRoleFieldErrorsByCode: Record<
  string,
  Record<string, string>
> = {
  'workspace.role_name_conflict': { name: 'workspaceRoleName.duplicate' },
  'workspace.invalid_input': { name: 'workspaceRoleName.server' },
};

/** Translates a Workspace Role-name rejection's rule into its validation key. */
export const workspaceRoleNameValidationKey = (
  outcome: MutationOutcome,
): MutationOutcome => {
  const rule = outcome.fieldErrors?.name;
  return rule
    ? {
        ...outcome,
        fieldErrors: {
          ...outcome.fieldErrors,
          name: validationKeysByRule[rule] ?? rule,
        },
      }
    : outcome;
};
