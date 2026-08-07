import { passwordChangeInputSchema } from '@warehouser/contracts/users';

import type { PasswordChangeInput } from '@warehouser/contracts/users';

export type PasswordChangeValidationError = { password?: 'invalid' };

export const parsePasswordChangeForm = (
  password: string,
):
  | { data: PasswordChangeInput; success: true }
  | { error: PasswordChangeValidationError; success: false } => {
  const parsed = passwordChangeInputSchema.safeParse({ password });
  if (parsed.success) {
    return { data: parsed.data, success: true };
  }

  return { error: { password: 'invalid' }, success: false };
};
