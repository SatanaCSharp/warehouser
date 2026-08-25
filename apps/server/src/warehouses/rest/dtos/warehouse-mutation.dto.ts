import {
  warehouseArchivalSchema,
  warehouseWriteSchema,
} from '@warehouser/contracts/workspaces';
import { createZodDto } from 'nestjs-zod';

// Thin `createZodDto` adapters over `@warehouser/contracts/workspaces`. They
// redefine no network shape: every rule stays in the shared schema the web
// validates against (adding-and-using-contracts.md §5, ADR 12-07-2026).
// `WarehouseMembershipAssignmentDto` is not here: a DTO is module-private
// (adding-a-server-module.md §8), and the membership routes belong to
// `access`, which owns its own adapter over the same published schema.
export class WarehouseWriteDto extends createZodDto(warehouseWriteSchema) {}

export class WarehouseArchivalDto extends createZodDto(
  warehouseArchivalSchema,
) {}
