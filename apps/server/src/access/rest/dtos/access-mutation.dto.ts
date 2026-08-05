import {
  managerTransferSchema,
  roleAssignmentSchema,
  roleDeletionSchema,
  roleWriteSchema,
} from '@warehouser/contracts/access';
import { createZodDto } from 'nestjs-zod';

export class RoleWriteDto extends createZodDto(roleWriteSchema) {}
export class RoleDeletionDto extends createZodDto(roleDeletionSchema) {}
export class RoleAssignmentDto extends createZodDto(roleAssignmentSchema) {}
export class ManagerTransferDto extends createZodDto(managerTransferSchema) {}
