import { emailChangeInputSchema } from '@warehouser/contracts/users';

import type { EmailChangeInput } from '@warehouser/contracts/users';

export type EmailChangeValidationError = { email?: 'invalid' };

export const parseEmailChangeForm = (
  email: string,
):
  | { data: EmailChangeInput; success: true }
  | { error: EmailChangeValidationError; success: false } => {
  const parsed = emailChangeInputSchema.safeParse({ email });
  if (parsed.success) {
    return { data: parsed.data, success: true };
  }

  return { error: { email: 'invalid' }, success: false };
};
