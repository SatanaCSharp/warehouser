import {
  authenticatedUserSchema,
  registrationResultSchema,
} from '@warehouser/contracts/auth';

import { api } from 'shared/api/api-client';

import type {
  AuthCredentials,
  AuthenticatedUser,
  RegistrationInput,
  RegistrationResult,
} from '@warehouser/contracts/auth';

const AUTH_PATH = '/api/v1/auth';

export const authApi = api.injectEndpoints({
  endpoints: (build) => ({
    signUp: build.mutation<RegistrationResult, RegistrationInput>({
      query: (body) => ({ url: `${AUTH_PATH}/sign-up`, method: 'POST', body }),
      extraOptions: { schema: registrationResultSchema },
      invalidatesTags: ['CurrentSession'],
    }),
    signIn: build.mutation<AuthenticatedUser, AuthCredentials>({
      query: (body) => ({ url: `${AUTH_PATH}/sign-in`, method: 'POST', body }),
      extraOptions: { schema: authenticatedUserSchema },
      invalidatesTags: ['CurrentSession'],
    }),
    getCurrentSession: build.query<AuthenticatedUser | null, void>({
      query: () => `${AUTH_PATH}/session`,
      extraOptions: { schema: authenticatedUserSchema, emptyResponse: null },
      providesTags: ['CurrentSession'],
    }),
    signOut: build.mutation<void, void>({
      query: () => ({ url: `${AUTH_PATH}/session`, method: 'DELETE' }),
      invalidatesTags: ['CurrentSession'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetCurrentSessionQuery,
  useSignInMutation,
  useSignOutMutation,
  useSignUpMutation,
} = authApi;
