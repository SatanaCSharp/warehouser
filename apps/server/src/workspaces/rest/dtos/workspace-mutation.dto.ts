import {
  activeWarehouseWriteSchema,
  workspaceRenameSchema,
} from '@warehouser/contracts/workspaces';
import { createZodDto } from 'nestjs-zod';

// Thin `createZodDto` adapters over `@warehouser/contracts/workspaces`. They
// redefine no network shape: every rule stays in the shared schema the web
// validates against (adding-and-using-contracts.md §5, ADR 12-07-2026).
//
// Only the two DTOs the retained Workspace handlers bind remain here; the role
// and member half moved to `access/rest/dtos/workspace-access-mutation.dto.ts`
// with the handlers that declare it (CH-S2), because a DTO is module-private
// (adding-a-server-module.md §8).
export class ActiveWarehouseWriteDto extends createZodDto(
  activeWarehouseWriteSchema,
) {}

export class WorkspaceRenameDto extends createZodDto(workspaceRenameSchema) {}
