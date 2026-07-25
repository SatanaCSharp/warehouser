import { UserId } from 'auth/domain/value-objects/identity-id';

export interface AuthenticatedPrincipal {
  readonly userId: string;
}

export const toAuthenticatedPrincipal = (
  userId: UserId,
): AuthenticatedPrincipal => ({ userId: userId.value });
