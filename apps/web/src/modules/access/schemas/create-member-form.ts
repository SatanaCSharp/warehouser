import { createMemberInputSchema } from '@warehouser/contracts/users';

import type { CreateMemberInput } from '@warehouser/contracts/users';

export type CreateMemberValidationError = {
  email?: 'invalid';
  password?: 'invalid';
};

export const parseCreateMemberForm = (
  email: string,
  password: string,
  roleId: string,
):
  | { data: CreateMemberInput; success: true }
  | { error: CreateMemberValidationError; success: false } => {
  const parsed = createMemberInputSchema.safeParse({ email, password, roleId });
  if (parsed.success) {
    return { data: parsed.data, success: true };
  }

  const error: CreateMemberValidationError = {};
  if (!createMemberInputSchema.shape.email.safeParse(email).success) {
    error.email = 'invalid';
  }
  if (!createMemberInputSchema.shape.password.safeParse(password).success) {
    error.password = 'invalid';
  }
  return { error, success: false };
};
