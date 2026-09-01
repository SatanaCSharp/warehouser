import { workspacePermissionIdSchema } from 'workspaces/workspaces-projections';
import { z } from 'zod';

export const activeWarehouseWriteSchema = z.strictObject({
  warehouseId: z.string().uuid(),
});

// The name schemas deliberately carry no lower bound. openapi.yaml documents
// "empty after trimming" as a *business* rejection —
// `workspace.invalid_input` with `field: name`, `rule: empty` — raised by the
// shared name value object, which is also what trims. A `min(1)` here makes
// the transport pipe answer `request.invalid` first, and only for a literally
// empty string: `'   '` passes it and reaches the domain, so the same member
// mistake produces two different codes depending on whether they typed a
// space. The upper bound stays as a payload guard.
export const workspaceRenameSchema = z.strictObject({
  name: z.string().max(100),
});

// The ceiling is a payload guard, not a business rule: the Workspace Permission catalogue holds
// well under a hundred entries and a legal request never repeats one, so no caller reaches it. It
// exists because an unbounded request array is priced by the caller — every rejected element
// produces a validation issue the server has to normalize synchronously, ahead of any guard
// (`apps/server/src/shared/errors/validation-field-codes.ts`).
export const workspaceRoleWriteSchema = z.strictObject({
  name: z.string().max(100),
  workspacePermissionIds: z.array(workspacePermissionIdSchema).max(100),
});

// The request body is optional: openapi.yaml marks it `required: false`
// because an unassigned Workspace Role is deleted with no body at all
// (AC-17a). Express 5 leaves `req.body` `undefined` for an absent body, and a
// bare object schema rejects that as `request.invalid` before the route ever
// runs — so the absent case is spelled out here, where the wire shape is
// defined, rather than worked around at the controller.
export const workspaceRoleDeletionSchema = z
  .strictObject({
    replacementWorkspaceRoleId: z.string().uuid().optional(),
  })
  .default({});

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
  name: z.string().max(100),
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
