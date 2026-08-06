import { z } from 'zod';

const emailPattern =
  /^(?=[^@]{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;

const emailSchema = z
  .string()
  .transform((email) => email.trim().toLowerCase())
  .pipe(z.string().min(3).max(254).regex(emailPattern));

const passwordSchema = z.string().superRefine((password, context) => {
  const length = Array.from(password).length;

  if (length < 8 || length > 128) {
    context.addIssue({
      code: 'custom',
      message: 'Password must contain 8 to 128 Unicode code points.',
    });
  }
});

export const createMemberInputSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  roleId: z.string().uuid(),
});
export const memberSchema = z.strictObject({
  userId: z.string().uuid(),
  email: emailSchema,
  roleId: z.string().uuid(),
});
export const emailChangeInputSchema = z.strictObject({
  email: emailSchema,
});
export const memberEmailSchema = z.strictObject({
  userId: z.string().uuid(),
  email: emailSchema,
});
export const passwordChangeInputSchema = z.strictObject({
  password: passwordSchema,
});
export const memberConfirmationSchema = z.strictObject({
  userId: z.string().uuid(),
});

export type CreateMemberInput = z.infer<typeof createMemberInputSchema>;
export type Member = z.infer<typeof memberSchema>;
export type EmailChangeInput = z.infer<typeof emailChangeInputSchema>;
export type MemberEmail = z.infer<typeof memberEmailSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeInputSchema>;
export type MemberConfirmation = z.infer<typeof memberConfirmationSchema>;
