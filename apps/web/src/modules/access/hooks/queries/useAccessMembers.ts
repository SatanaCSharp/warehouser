import { useListAccessMembersQuery } from 'modules/access/api/access-api';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';
import { toAccessDataset } from 'modules/access/utils/access-dataset';

import type { AccessMember } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

/**
 * Members, loaded for whoever asks. Role assignment and manager transfer both
 * pick a member, so the query fires for those actors too — an actor entitled to
 * none of it never requests it.
 */
export const useAccessMembers = (): AccessDataset<AccessMember> => {
  const {
    canAssignRoles,
    canManageMemberLifecycle,
    canReadMembers,
    canTransferManager,
    warehouseId,
  } = useAccessCapabilities();

  return toAccessDataset(
    useListAccessMembersQuery(warehouseId ?? '', {
      skip:
        warehouseId === undefined ||
        !(
          canReadMembers ||
          canAssignRoles ||
          canTransferManager ||
          canManageMemberLifecycle
        ),
    }),
  );
};
