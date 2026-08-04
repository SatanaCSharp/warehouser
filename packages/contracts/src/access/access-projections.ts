import { z } from 'zod';

export const permissionIdSchema = z
  .string()
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/u);
const roleKindSchema = z.enum(['custom', 'warehouse_manager']);

export const accessProjectionSchema = z.strictObject({
  warehouseId: z.string().uuid(),
  roleId: z.string().uuid(),
  roleKind: roleKindSchema,
  permissionIds: z.array(permissionIdSchema),
});
export const roleSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  kind: roleKindSchema,
  permissionIds: z.array(permissionIdSchema),
});
export const permissionSchema = z.strictObject({
  id: permissionIdSchema,
  label: z.string().min(1).max(100),
  kind: z.enum(['assignable', 'reserved']),
});
export const memberSchema = z.strictObject({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
  roleKind: roleKindSchema,
});

const pageShape = {
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
  nextCursor: z.string().nullable(),
};
export const rolePageSchema = z.strictObject({
  ...pageShape,
  items: z.array(roleSchema),
});
export const permissionPageSchema = z.strictObject({
  ...pageShape,
  items: z.array(permissionSchema),
});
export const memberPageSchema = z.strictObject({
  ...pageShape,
  items: z.array(memberSchema),
});

export type AccessProjection = z.infer<typeof accessProjectionSchema>;
export type RolePage = z.infer<typeof rolePageSchema>;
export type PermissionPage = z.infer<typeof permissionPageSchema>;
export type MemberPage = z.infer<typeof memberPageSchema>;
