import { authCredentialsSchema } from '@warehouser/contracts/auth';
import { createZodDto } from 'nestjs-zod';

export class AuthCredentialsDto extends createZodDto(authCredentialsSchema) {}
