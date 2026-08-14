import { warehouseMembershipAssignmentSchema } from '@warehouser/contracts/workspaces';
import { createZodDto } from 'nestjs-zod';

// A thin `createZodDto` adapter over `@warehouser/contracts/workspaces`. It
// redefines no network shape: every rule stays in the shared schema the web
// validates against (adding-and-using-contracts.md §5, ADR 12-07-2026). The
// schema keeps its published `workspaces` subpath — a scoped package subpath
// is a deliberate shared boundary, not a `workspaces` module import (CR-AC-13).
// The class lives in `access` rather than `warehouses` because a DTO is
// module-private and belongs to the module serving the route
// (adding-a-server-module.md §8): granting and revoking a Warehouse Role is
// Access, and the Warehouse it names is only its subject (CH-S3).
export class WarehouseMembershipAssignmentDto extends createZodDto(
  warehouseMembershipAssignmentSchema,
) {}
