import { z } from 'zod';

const emailPattern =
  /^(?=[^@]{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;

const normalizedEmailSchema = z
  .string()
  .transform((email) => email.trim().toLowerCase())
  .pipe(z.string().max(254).regex(emailPattern));

const passwordSchema = z.string().superRefine((password, context) => {
  const length = Array.from(password).length;

  if (length < 8 || length > 128) {
    context.addIssue({
      code: 'custom',
      message: 'Password must contain 8 to 128 Unicode code points.',
    });
  }
});

export const authCredentialsSchema = z
  .object({
    email: normalizedEmailSchema,
    password: passwordSchema,
  })
  .strict();

export const userSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

export const authenticatedUserSchema = z
  .object({
    user: userSchema,
  })
  .strict();

export const errorResponseSchema = z
  .object({
    code: z.string().regex(/^[a-z_]+\.[a-z_]+$/u),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
