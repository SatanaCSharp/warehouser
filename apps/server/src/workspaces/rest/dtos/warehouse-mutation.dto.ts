import {
  warehouseArchivalSchema,
  warehouseMembershipAssignmentSchema,
  warehouseWriteSchema,
} from '@warehouser/contracts/workspaces';
import { createZodDto } from 'nestjs-zod';

// Thin `createZodDto` adapters over `@warehouser/contracts/workspaces`. They
// redefine no network shape: every rule stays in the shared schema the web
// validates against (adding-and-using-contracts.md §5, ADR 12-07-2026).
export class WarehouseWriteDto extends createZodDto(warehouseWriteSchema) {}

export class WarehouseArchivalDto extends createZodDto(
  warehouseArchivalSchema,
) {}

export class WarehouseMembershipAssignmentDto extends createZodDto(
  warehouseMembershipAssignmentSchema,
) {}
