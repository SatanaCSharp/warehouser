import { SetMetadata } from '@nestjs/common';

export const INFRASTRUCTURE_ACCESS_KEY = 'access.infrastructure-exempt';

export const InfrastructureAccess = () =>
  SetMetadata(INFRASTRUCTURE_ACCESS_KEY, true);
