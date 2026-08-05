import { registrationInputSchema } from '@warehouser/contracts/auth';
import { createZodDto } from 'nestjs-zod';

export class RegistrationDto extends createZodDto(registrationInputSchema) {}
