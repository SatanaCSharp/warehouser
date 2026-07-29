import { authCredentialsSchema } from '@warehouser/contracts/auth';
import { z } from 'zod';

export const signUpValidationKeys = {
  emailInvalid: 'email.invalid',
  passwordLength: 'password.lengthRange',
} as const;

const rawSignUpFormSchema = z.object({
  email: z.string(),
  password: z.string(),
});

export const signUpFormSchema = rawSignUpFormSchema
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
        message: signUpValidationKeys.emailInvalid,
      });
    }
    if (invalidFields.has('password')) {
      context.addIssue({
        code: 'custom',
        path: ['password'],
        message: signUpValidationKeys.passwordLength,
      });
    }
  })
  .transform((credentials) => ({
    email: credentials.email.trim().toLowerCase(),
    password: credentials.password,
  }));

export type SignUpFormValues = z.input<typeof signUpFormSchema>;
