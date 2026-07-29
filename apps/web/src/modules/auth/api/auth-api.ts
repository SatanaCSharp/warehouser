import { authenticatedUserSchema } from '@warehouser/contracts/auth';

import { ApiFailure, request } from 'shared/api/api-client';

import type {
  AuthCredentials,
  AuthenticatedUser,
} from '@warehouser/contracts/auth';

const AUTH_PATH = '/api/v1/auth';

const requestAuthenticatedUser = async (
  path: string,
  credentials: AuthCredentials,
): Promise<AuthenticatedUser> => {
  const result = await request(`${AUTH_PATH}/${path}`, {
    method: 'POST',
    body: credentials,
    schema: authenticatedUserSchema,
  });

  if (!result) {
    throw new ApiFailure('api.unexpected');
  }

  return result;
};

export const signUp = (
  credentials: AuthCredentials,
): Promise<AuthenticatedUser> =>
  requestAuthenticatedUser('sign-up', credentials);

export const signIn = (
  credentials: AuthCredentials,
): Promise<AuthenticatedUser> =>
  requestAuthenticatedUser('sign-in', credentials);

export const getCurrentSession = async (): Promise<AuthenticatedUser | null> =>
  (await request(`${AUTH_PATH}/session`, {
    schema: authenticatedUserSchema,
  })) ?? null;

export const signOut = async (): Promise<void> => {
  await request(`${AUTH_PATH}/session`, { method: 'DELETE' });
};
