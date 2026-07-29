import { authCredentialsSchema } from '@warehouser/contracts/auth';
import { z } from 'zod';

export const loginValidationKeys = {
  emailInvalid: 'email.invalid',
  passwordLength: 'password.lengthRange',
} as const;

export type LoginValidationKey =
  (typeof loginValidationKeys)[keyof typeof loginValidationKeys];

const rawLoginFormSchema = z.object({
  email: z.string(),
  password: z.string(),
});

export const loginFormSchema = rawLoginFormSchema
  .superRefine((credentials, context) => {
    const parsed = authCredentialsSchema.safeParse(credentials);
    if (parsed.success) {
      return;
    }

    const invalidFields = new Set(
      parsed.error.issues.map((issue) => issue.path[0]),
    );
    if (invalidFields.has('email')) {
      context.addIssue({
        code: 'custom',
        path: ['email'],
        message: loginValidationKeys.emailInvalid,
      });
    }
    if (invalidFields.has('password')) {
      context.addIssue({
        code: 'custom',
        path: ['password'],
        message: loginValidationKeys.passwordLength,
      });
    }
  })
  .transform((credentials) => ({
    email: credentials.email.trim().toLowerCase(),
    password: credentials.password,
  }));

export type LoginFormValues = z.input<typeof loginFormSchema>;
