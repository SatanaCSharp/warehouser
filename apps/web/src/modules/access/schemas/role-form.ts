import type { RoleWrite } from '@warehouser/contracts/access';
import { roleWriteSchema } from '@warehouser/contracts/access';
import type { FormParseResult } from 'shared/utils/form-parse';

export type RoleNameValidationError = 'characters' | 'length' | 'required';

export const parseRoleForm = (
  name: string,
  permissionIds: string[],
):
  | { error: RoleNameValidationError; success: false }
  | { data: RoleWrite; success: true } => {
  const parsed = roleWriteSchema.safeParse({ name, permissionIds });
  if (parsed.success) {
    return { data: parsed.data, success: true };
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { error: 'required', success: false };
  }
  if (/[\p{Cc}\p{Cf}]/u.test(trimmedName)) {
    return { error: 'characters', success: false };
  }
  return { error: 'length', success: false };
};

/** The Role name-and-grants values a form holds, before they are validated. */
export type RoleFormValues = { name: string; permissionIds: string[] };

/**
 * {@link parseRoleForm} as the form-shaped validation step the Role dialog and
 * the inline Role editor both run. The parse reports one code for the whole
 * form because the name is the only value it can reject, so the field that
 * code belongs to is named here rather than at each call site.
 */
export const parseRoleFormValues = ({
  name,
  permissionIds,
}: RoleFormValues): FormParseResult<RoleFormValues, RoleWrite> => {
  const parsed = parseRoleForm(name, permissionIds);
  return parsed.success
    ? parsed
    : { error: { name: parsed.error }, success: false };
};
