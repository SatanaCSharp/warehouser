import { useListAccessPermissionsQuery } from 'modules/access/api/access-api';
import { toAccessDataset } from 'modules/access/hooks/access-dataset';
import { useAccessCapabilities } from 'modules/access/hooks/useAccessCapabilities';

import type { AccessDataset } from 'modules/access/hooks/access-dataset';
import type { AccessPermission } from 'modules/access/types/access.types';

/** The Permission catalogue every Role form grants from. */
export const useAccessPermissions = (): AccessDataset<AccessPermission> => {
  const { canReadPermissions } = useAccessCapabilities();

  return toAccessDataset(
    useListAccessPermissionsQuery(undefined, { skip: !canReadPermissions }),
  );
};
