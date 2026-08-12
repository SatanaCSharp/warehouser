import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { WorkspacePermissionId as WorkspacePermissionIdConst } from '@warehouser/shared-types/enums';
import { z } from 'zod';

const workspacePermissionIdValues = Object.values(
  WorkspacePermissionIdConst,
) as [WorkspacePermissionId, ...WorkspacePermissionId[]];

export const workspacePermissionIdSchema = z.enum(workspacePermissionIdValues);
const warehouseRoleKindSchema = z.enum(['custom', 'warehouse_manager']);
const workspaceRoleKindSchema = z.enum(['custom', 'workspace_owner']);

export const workspaceSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).nullable(),
});

export const contextWarehouseSchema = z.strictObject({
  warehouseId: z.string().uuid(),
  name: z.string().min(1).max(100),
  archivedAt: z.string().datetime().nullable(),
  roleId: z.string().uuid(),
  roleKind: warehouseRoleKindSchema,
});

export const workspaceContextSchema = z.strictObject({
  workspace: workspaceSchema,
  workspacePermissionIds: z.array(workspacePermissionIdSchema),
  warehouses: z.array(contextWarehouseSchema),
  effectiveWarehouseId: z.string().uuid().nullable(),
});

export const activeWarehouseSelectionSchema = z.strictObject({
  effectiveWarehouseId: z.string().uuid().nullable(),
});

export const workspaceRoleSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  kind: workspaceRoleKindSchema,
  workspacePermissionIds: z.array(workspacePermissionIdSchema),
  assignedMemberCount: z.number().int().nonnegative(),
});

export const workspacePermissionSchema = z.strictObject({
  id: workspacePermissionIdSchema,
  label: z.string().min(1).max(100),
  kind: z.enum(['assignable', 'reserved']),
});

export const workspaceMemberSchema = z.strictObject({
  userId: z.string().uuid(),
  workspaceRoleId: z.string().uuid(),
  workspaceRoleKind: workspaceRoleKindSchema,
  email: z.string().email().max(254).optional(),
});

export const workspaceUserWarehouseSchema = z.strictObject({
  warehouseId: z.string().uuid(),
  roleId: z.string().uuid(),
  roleKind: warehouseRoleKindSchema,
});

export const workspaceUserSchema = z.strictObject({
  userId: z.string().uuid(),
  email: z.string().email().max(254).optional(),
  isWorkspaceMember: z.boolean(),
  warehouses: z.array(workspaceUserWarehouseSchema),
});

export const workspaceOwnerTransferResultSchema = z.strictObject({
  ownerUserId: z.string().uuid(),
  formerOwnerUserId: z.string().uuid(),
  formerOwnerWorkspaceRoleId: z.string().uuid(),
});

export const warehouseSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  archivedAt: z.string().datetime().nullable(),
});

export const assignableWarehouseRoleSchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
});

export const warehouseMembershipSchema = z.strictObject({
  userId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  roleId: z.string().uuid(),
  roleKind: warehouseRoleKindSchema,
});

export type Workspace = z.infer<typeof workspaceSchema>;
export type ContextWarehouse = z.infer<typeof contextWarehouseSchema>;
export type WorkspaceContext = z.infer<typeof workspaceContextSchema>;
export type ActiveWarehouseSelection = z.infer<
  typeof activeWarehouseSelectionSchema
>;
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type WorkspacePermission = z.infer<typeof workspacePermissionSchema>;
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceUserWarehouse = z.infer<
  typeof workspaceUserWarehouseSchema
>;
export type WorkspaceUser = z.infer<typeof workspaceUserSchema>;
export type WorkspaceOwnerTransferResult = z.infer<
  typeof workspaceOwnerTransferResultSchema
>;
export type Warehouse = z.infer<typeof warehouseSchema>;
export type AssignableWarehouseRole = z.infer<
  typeof assignableWarehouseRoleSchema
>;
export type WarehouseMembership = z.infer<typeof warehouseMembershipSchema>;
