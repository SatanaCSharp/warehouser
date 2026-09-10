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
  id: z.uuid(),
  name: z.string().min(1).max(100).nullable(),
});

export const contextWarehouseSchema = z.strictObject({
  warehouseId: z.uuid(),
  name: z.string().min(1).max(100),
  archivedAt: z.iso.datetime().nullable(),
  roleId: z.uuid(),
  roleKind: warehouseRoleKindSchema,
});

export const workspaceContextSchema = z.strictObject({
  workspace: workspaceSchema,
  workspacePermissionIds: z.array(workspacePermissionIdSchema),
  warehouses: z.array(contextWarehouseSchema),
  effectiveWarehouseId: z.uuid().nullable(),
});

export const activeWarehouseSelectionSchema = z.strictObject({
  effectiveWarehouseId: z.uuid().nullable(),
});

export const workspaceRoleSchema = z.strictObject({
  id: z.uuid(),
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
  userId: z.uuid(),
  workspaceRoleId: z.uuid(),
  workspaceRoleKind: workspaceRoleKindSchema,
  email: z.email().max(254).optional(),
});

// AC-33 — the Workspace-level Users read carries the Warehouses a User belongs
// to and deliberately **no** Warehouse Role. `WORKSPACE_MEMBERS:WATCH` covers
// the Users of the Workspace and their Warehouses; it does not cover their
// Warehouse Roles, so carrying `roleId`/`roleKind` here would either exceed the
// read the actor holds or invite the AC-31 level confusion the two vocabularies
// exist to prevent. See sad.md §5, T9's DoD ("projected without any Warehouse
// Role") and design-handoff.md §"The level boundary is part of the design",
// which forbids the Warehouse detail pane from showing a person's Role.
export const workspaceUserWarehouseSchema = z.strictObject({
  warehouseId: z.uuid(),
});

export const workspaceUserSchema = z.strictObject({
  userId: z.uuid(),
  email: z.email().max(254).optional(),
  isWorkspaceMember: z.boolean(),
  warehouses: z.array(workspaceUserWarehouseSchema),
});

export const workspaceOwnerTransferResultSchema = z.strictObject({
  ownerUserId: z.uuid(),
  formerOwnerUserId: z.uuid(),
  formerOwnerWorkspaceRoleId: z.uuid(),
});

export const warehouseSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  archivedAt: z.iso.datetime().nullable(),
});

// AC-10 — the Warehouse's one Delivery Address and its access notes: two
// columns on the Warehouse record rather than a row in the Customer address
// relation, so there is no Main flag and no `deactivatedAt`. `addressText` is
// `null` until recorded, which is exactly the state a freeze of a Via
// Warehouse line is refused from (AC-16a).
export const warehouseDeliveryAddressSchema = z.strictObject({
  warehouseId: z.uuid(),
  addressText: z.string().min(1).nullable(),
  accessNotes: z.string().min(1).nullable(),
});

export const assignableWarehouseRoleSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(100),
});

export const warehouseMembershipSchema = z.strictObject({
  userId: z.uuid(),
  warehouseId: z.uuid(),
  roleId: z.uuid(),
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
export type WarehouseDeliveryAddress = z.infer<
  typeof warehouseDeliveryAddressSchema
>;
export type AssignableWarehouseRole = z.infer<
  typeof assignableWarehouseRoleSchema
>;
export type WarehouseMembership = z.infer<typeof warehouseMembershipSchema>;
