import { roleWriteSchema } from '@warehouser/contracts/access';

import type { RoleWrite } from '@warehouser/contracts/access';

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
