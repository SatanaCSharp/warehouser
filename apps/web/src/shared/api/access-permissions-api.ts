import { accessProjectionSchema } from '@warehouser/contracts/access';

import { api } from 'shared/api/api-client';

import type { AccessProjection } from '@warehouser/contracts/access';

const ACCESS_PATH = '/api/v1/access';

export const accessPermissionsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getCurrentAccess: build.query<AccessProjection, void>({
      query: () => `${ACCESS_PATH}/current`,
      extraOptions: { schema: accessProjectionSchema },
      providesTags: ['CurrentAccess'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetCurrentAccessQuery } = accessPermissionsApi;
