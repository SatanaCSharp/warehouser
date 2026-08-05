import { permissionIdSchema } from 'access/access-projections';
import { z } from 'zod';

const paginationLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20);

export const uuidPaginationSchema = z
  .strictObject({
    after: z.string().uuid().optional(),
    before: z.string().uuid().optional(),
    limit: paginationLimitSchema,
  })
  .refine(({ after, before }) => after === undefined || before === undefined, {
    message: 'after and before are mutually exclusive',
  });

export const permissionPaginationSchema = z
  .strictObject({
    after: permissionIdSchema.optional(),
    before: permissionIdSchema.optional(),
    limit: paginationLimitSchema,
  })
  .refine(({ after, before }) => after === undefined || before === undefined, {
    message: 'after and before are mutually exclusive',
  });

export type UuidPagination = z.infer<typeof uuidPaginationSchema>;
export type PermissionPagination = z.infer<typeof permissionPaginationSchema>;
