import {
  memberSchema,
  permissionIdSchema,
  roleSchema,
} from 'access/access-projections';
import { z } from 'zod';

const domainNameSchema = z
  .string()
  .transform((name) => name.trim())
  .pipe(
    z
      .string()
      .min(1)
      .max(100)
      .regex(/^[^\p{Cc}\p{Cf}]+$/u),
  );
const uniquePermissionIdsSchema = z
  .array(permissionIdSchema)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Permission identifiers must be unique',
  });

export const roleWriteSchema = z.strictObject({
  name: domainNameSchema,
  permissionIds: uniquePermissionIdsSchema,
});
export const roleDeletionSchema = z.strictObject({
  replacementRoleId: z.string().uuid().nullable(),
});
export const roleAssignmentSchema = z.strictObject({
  roleId: z.string().uuid(),
});
export const managerTransferSchema = z.strictObject({
  recipientUserId: z.string().uuid(),
  formerManagerRoleId: z.string().uuid(),
});
export const managerTransferResultSchema = z.strictObject({
  managerUserId: z.string().uuid(),
  formerManagerUserId: z.string().uuid(),
  formerManagerRoleId: z.string().uuid(),
});

export {
  memberSchema as memberMutationResultSchema,
  roleSchema as roleMutationResultSchema,
};
export type RoleWrite = z.infer<typeof roleWriteSchema>;
export type RoleDeletion = z.infer<typeof roleDeletionSchema>;
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;
export type ManagerTransfer = z.infer<typeof managerTransferSchema>;
export type ManagerTransferResult = z.infer<typeof managerTransferResultSchema>;
