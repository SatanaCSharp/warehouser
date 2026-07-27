import { z } from 'zod';

export const loginValidationKeys = {
  emailInvalid: 'email.invalid',
  passwordLength: 'password.length',
} as const;

export type LoginValidationKey =
  (typeof loginValidationKeys)[keyof typeof loginValidationKeys];

export const loginFormSchema = z.object({
  email: z.string().email({ message: loginValidationKeys.emailInvalid }),
  password: z.string().min(8, { message: loginValidationKeys.passwordLength }),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
