import { registrationInputSchema } from '@warehouser/contracts/auth';
import { z } from 'zod';

export const signUpValidationKeys = {
  emailInvalid: 'email.invalid',
  passwordLength: 'password.lengthRange',
  warehouseNameLength: 'warehouseName.lengthRange',
  warehouseNameRequired: 'warehouseName.required',
  warehouseNameUnsupportedCharacter: 'warehouseName.unsupportedCharacter',
} as const;

const rawSignUpFormSchema = z.object({
  email: z.string(),
  password: z.string(),
  warehouseName: z.string(),
});

export const signUpFormSchema = rawSignUpFormSchema
  .superRefine((credentials, context) => {
    const parsed = registrationInputSchema.safeParse(credentials);
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
    const warehouseNameIssue = parsed.error.issues.find(
      (issue) => issue.path[0] === 'warehouseName',
    );
    if (warehouseNameIssue) {
      context.addIssue({
        code: 'custom',
        path: ['warehouseName'],
        message: warehouseNameIssue.message.includes('control or format')
          ? signUpValidationKeys.warehouseNameUnsupportedCharacter
          : credentials.warehouseName.trim().length === 0
            ? signUpValidationKeys.warehouseNameRequired
            : signUpValidationKeys.warehouseNameLength,
      });
    }
  })
  .transform((credentials) => ({
    email: credentials.email.trim().toLowerCase(),
    password: credentials.password,
    warehouseName: credentials.warehouseName.trim(),
  }));

export type SignUpFormValues = z.input<typeof signUpFormSchema>;
