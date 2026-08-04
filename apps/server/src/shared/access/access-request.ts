import type { AccessPrincipal } from 'shared/access/access-principal';
import type { AuthenticatedRequest } from 'shared/guards/session-auth.guard';

export interface WarehouseAccessRequest extends AuthenticatedRequest {
  access?: AccessPrincipal;
}
