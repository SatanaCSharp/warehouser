import type { AccessCurrentUser } from 'shared/access/access-current-user';
import type { AuthenticatedRequest } from 'shared/guards/session-auth.guard';

export interface WarehouseAccessRequest extends AuthenticatedRequest {
  access?: AccessCurrentUser;
}
