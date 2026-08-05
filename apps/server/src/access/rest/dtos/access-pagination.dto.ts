import {
  permissionPaginationSchema,
  uuidPaginationSchema,
} from '@warehouser/contracts/access';
import { createZodDto } from 'nestjs-zod';

export class UuidPaginationDto extends createZodDto(uuidPaginationSchema) {}
export class PermissionPaginationDto extends createZodDto(
  permissionPaginationSchema,
) {}
