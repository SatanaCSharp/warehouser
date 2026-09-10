import type { AccessProjection } from '@warehouser/contracts/access';
import { accessProjectionSchema } from '@warehouser/contracts/access';
import { api } from 'shared/api/client/api-client';
import { warehousePath } from 'shared/api/warehouse/warehouse-path';

export const accessPermissionsApi = api.injectEndpoints({
  endpoints: (build) => ({
    /**
     * What the actor may do **in one named Warehouse**. AC-05 makes authority
     * that of the membership held in the Warehouse being acted on, so the
     * Warehouse id is the query argument — and therefore the cache key — rather
     * than an ambient selection the server would have to guess at.
     */
    getCurrentAccess: build.query<AccessProjection, string>({
      query: (warehouseId) => warehousePath(warehouseId, 'access/current'),
      extraOptions: { schema: accessProjectionSchema },
      providesTags: (_result, _error, warehouseId) => [
        { type: 'CurrentAccess', id: warehouseId },
      ],
    }),
  }),
  overrideExisting: false,
});

export const { useGetCurrentAccessQuery } = accessPermissionsApi;
