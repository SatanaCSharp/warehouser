import {
  createMemberInputSchema,
  emailChangeInputSchema,
  passwordChangeInputSchema,
} from '@warehouser/contracts/users';
import { createZodDto } from 'nestjs-zod';

export class CreateMemberDto extends createZodDto(createMemberInputSchema) {}
export class EmailChangeDto extends createZodDto(emailChangeInputSchema) {}
export class PasswordChangeDto extends createZodDto(
  passwordChangeInputSchema,
) {}
