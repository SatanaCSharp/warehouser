import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

// A rejected Workspace Role name arrives as `workspace.invalid_input` naming
// the field and the rule it broke, so the member is told which rule was not met
// rather than that something was wrong (AC-15a).
// The rule keys are the ones the server actually emits (`AccessName` via
// `create-workspace-role.command.ts`'s `NAME_RULE_BY_ASSERTION_MESSAGE`), so
// an empty name arrives as `empty`, never `blank`.
const validationKeysByRule: Record<string, string> = {
  empty: 'workspaceRoleName.required',
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

// `runWorkspaceMutation` applies `workspaceRoleFieldErrorsByCode` before this
// runs, so the field may already carry a resolved validation key rather than a
// server rule — AC-15's `workspaceRoleName.duplicate` arrives that way. A
// resolved key is namespaced; a server rule is a bare identifier.
const isResolvedValidationKey = (value: string): boolean =>
  value.startsWith('workspaceRoleName.');

/** Translates a Workspace Role-name rejection's rule into its validation key. */
export const workspaceRoleNameValidationKey = (
  outcome: MutationOutcome,
): MutationOutcome => {
  const rule = outcome.fieldErrors?.name;
  if (!rule) {
    return outcome;
  }

  return {
    ...outcome,
    fieldErrors: {
      ...outcome.fieldErrors,
      // An unrecognised *rule* still has to resolve to a real translation key
      // — passing the server's raw rule string through would render the code
      // itself to the member.
      name: isResolvedValidationKey(rule)
        ? rule
        : (validationKeysByRule[rule] ?? 'workspaceRoleName.server'),
    },
  };
};
