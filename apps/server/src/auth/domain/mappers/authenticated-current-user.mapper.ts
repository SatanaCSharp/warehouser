import { UserId } from 'auth/domain/value-objects/identity-id';

export interface AuthenticatedCurrentUser {
  readonly userId: string;
}

export const toAuthenticatedCurrentUser = (
  userId: UserId,
): AuthenticatedCurrentUser => ({ userId: userId.value });
