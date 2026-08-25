import {
  workspaceMemberAddSchema,
  workspaceOwnerTransferSchema,
  workspaceRoleAssignmentSchema,
  workspaceRoleDeletionSchema,
  workspaceRoleWriteSchema,
} from '@warehouser/contracts/workspaces';
import { createZodDto } from 'nestjs-zod';

// The role and member half of `workspaces/rest/dtos/workspace-mutation.dto.ts`,
// moved with the handlers that bind it (CH-S2). A DTO is module-private
// (adding-a-server-module.md §8), so it lives in the module whose controller
// declares it; the workspace half stays behind with `WorkspaceController`.
//
// Thin `createZodDto` adapters over `@warehouser/contracts/workspaces`. They
// redefine no network shape: every rule stays in the shared schema the web
// validates against (adding-and-using-contracts.md §5, ADR 12-07-2026). The
// class names are unchanged, because the route table pins the request DTO class
// of every route (CR-AC-11).
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
