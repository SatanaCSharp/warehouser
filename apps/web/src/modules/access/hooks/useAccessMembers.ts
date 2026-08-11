import { useListAccessMembersQuery } from 'modules/access/api/access-api';
import { toAccessDataset } from 'modules/access/hooks/access-dataset';
import { useAccessCapabilities } from 'modules/access/hooks/useAccessCapabilities';

import type { AccessDataset } from 'modules/access/hooks/access-dataset';
import type { AccessMember } from 'modules/access/types/access.types';

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
  } = useAccessCapabilities();

  return toAccessDataset(
    useListAccessMembersQuery(undefined, {
      skip: !(
        canReadMembers ||
        canAssignRoles ||
        canTransferManager ||
        canManageMemberLifecycle
      ),
    }),
  );
};
