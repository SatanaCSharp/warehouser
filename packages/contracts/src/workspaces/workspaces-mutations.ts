import { workspacePermissionIdSchema } from 'workspaces/workspaces-projections';
import { z } from 'zod';

export const activeWarehouseWriteSchema = z.strictObject({
  warehouseId: z.string().uuid(),
});

export const workspaceRenameSchema = z.strictObject({
  name: z.string().min(1).max(100),
});

export const workspaceRoleWriteSchema = z.strictObject({
  name: z.string().min(1).max(100),
  workspacePermissionIds: z.array(workspacePermissionIdSchema),
});

export const workspaceRoleDeletionSchema = z.strictObject({
  replacementWorkspaceRoleId: z.string().uuid().optional(),
});

export const workspaceRoleAssignmentSchema = z.strictObject({
  workspaceRoleId: z.string().uuid(),
});

export const workspaceMemberAddSchema = z.strictObject({
  userId: z.string().uuid(),
  workspaceRoleId: z.string().uuid(),
});

export const workspaceOwnerTransferSchema = z.strictObject({
  recipientUserId: z.string().uuid(),
  formerOwnerWorkspaceRoleId: z.string().uuid(),
});

export const warehouseWriteSchema = z.strictObject({
  name: z.string().min(1).max(100),
});

export const warehouseArchivalSchema = z.strictObject({
  archived: z.boolean(),
});

export const warehouseMembershipAssignmentSchema = z.strictObject({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export type ActiveWarehouseWrite = z.infer<typeof activeWarehouseWriteSchema>;
export type WorkspaceRename = z.infer<typeof workspaceRenameSchema>;
export type WorkspaceRoleWrite = z.infer<typeof workspaceRoleWriteSchema>;
export type WorkspaceRoleDeletion = z.infer<typeof workspaceRoleDeletionSchema>;
export type WorkspaceRoleAssignment = z.infer<
  typeof workspaceRoleAssignmentSchema
>;
export type WorkspaceMemberAdd = z.infer<typeof workspaceMemberAddSchema>;
export type WorkspaceOwnerTransfer = z.infer<
  typeof workspaceOwnerTransferSchema
>;
export type WarehouseWrite = z.infer<typeof warehouseWriteSchema>;
export type WarehouseArchival = z.infer<typeof warehouseArchivalSchema>;
export type WarehouseMembershipAssignment = z.infer<
  typeof warehouseMembershipAssignmentSchema
>;
