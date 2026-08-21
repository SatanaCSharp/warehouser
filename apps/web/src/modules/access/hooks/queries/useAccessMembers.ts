import { useListAccessMembersQuery } from 'modules/access/api/access-api';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { toAccessDataset } from 'modules/access/utils/access-dataset';
import { membersReadPermissions } from 'modules/access/utils/access-permission-sets';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

import type { AccessMember } from 'modules/access/types/access.types';
import type { AccessDataset } from 'modules/access/utils/access-dataset';

/**
 * Members, loaded for whoever asks. Role assignment and manager transfer both
 * pick a member, so the query fires for those actors too — an actor entitled to
 * none of it never requests it.
 *
 * The gate stays here, beside the read it gates; only the set it names is
 * declared once, in `utils/access-permission-sets.ts`, so the access loader
 * reproducing this condition cannot drift from it (CR-RG-02).
 */
export const useAccessMembers = (): AccessDataset<AccessMember> => {
  const { warehouseId } = useAccessScope();
  const isAllowed = useHasPermission(membersReadPermissions);

  return toAccessDataset(
    useListAccessMembersQuery(warehouseId ?? '', {
      skip: warehouseId === undefined || !isAllowed,
    }),
  );
};
