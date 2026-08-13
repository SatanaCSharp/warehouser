import {
  activeWarehouseWriteSchema,
  workspaceMemberAddSchema,
  workspaceOwnerTransferSchema,
  workspaceRenameSchema,
  workspaceRoleAssignmentSchema,
  workspaceRoleDeletionSchema,
  workspaceRoleWriteSchema,
} from '@warehouser/contracts/workspaces';
import { createZodDto } from 'nestjs-zod';

// Thin `createZodDto` adapters over `@warehouser/contracts/workspaces`. They
// redefine no network shape: every rule stays in the shared schema the web
// validates against (adding-and-using-contracts.md §5, ADR 12-07-2026).
export class ActiveWarehouseWriteDto extends createZodDto(
  activeWarehouseWriteSchema,
) {}

export class WorkspaceRenameDto extends createZodDto(workspaceRenameSchema) {}

export class WorkspaceRoleWriteDto extends createZodDto(
  workspaceRoleWriteSchema,
) {}

export class WorkspaceRoleDeletionDto extends createZodDto(
  workspaceRoleDeletionSchema,
) {}

export class WorkspaceRoleAssignmentDto extends createZodDto(
  workspaceRoleAssignmentSchema,
) {}

export class WorkspaceMemberAddDto extends createZodDto(
  workspaceMemberAddSchema,
) {}

export class WorkspaceOwnerTransferDto extends createZodDto(
  workspaceOwnerTransferSchema,
) {}
