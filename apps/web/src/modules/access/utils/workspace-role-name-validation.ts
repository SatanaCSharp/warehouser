import { fieldErrorMapFrom } from 'shared/utils/field-errors';
import { nameValidationKeyMapper } from 'shared/utils/name-validation';

/**
 * AC-15 — a name already used exactly in the Workspace is refused as its own
 * code, and the copy states that differently cased names stay distinct, so the
 * member does not read the refusal as case-insensitive.
 */
export const workspaceRoleFieldErrorsFor = fieldErrorMapFrom({
  'workspace.role_name_conflict': { name: 'workspaceRoleName.duplicate' },
  'workspace.invalid_input': { name: 'workspaceRoleName.server' },
});

/**
 * Translates a Workspace Role-name rejection's rule into its validation key.
 *
 * `runWorkspaceMutation` applies `workspaceRoleFieldErrorsFor` before this
 * runs, so the field may already carry a resolved validation key rather than a
 * server rule — AC-15's `workspaceRoleName.duplicate` arrives that way, and the
 * mapper leaves it untouched.
 */
export const workspaceRoleNameValidationKey = nameValidationKeyMapper({
  prefix: 'workspaceRoleName',
  fallbackSuffix: 'server',
});
