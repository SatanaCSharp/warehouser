import { useTranslation } from 'react-i18next';

import { CreateRoleAction } from 'modules/access/components/access-workspace/components/roles/CreateRoleAction';
import { MemberAssignmentList } from 'modules/access/components/access-workspace/components/roles/MemberAssignmentList';
import { RoleDirectory } from 'modules/access/components/access-workspace/components/roles/RoleDirectory';
import { RolesDatasetCard } from 'modules/access/components/access-workspace/components/roles/RolesDatasetCard';
import { TransferManagerAction } from 'modules/access/components/access-workspace/components/roles/TransferManagerAction';
import { useAccessCapabilities } from 'modules/access/hooks/useAccessCapabilities';
import { useAccessPermissions } from 'modules/access/hooks/useAccessPermissions';
import { useAccessRoles } from 'modules/access/hooks/useAccessRoles';

import type { ReactElement } from 'react';

/**
 * Roles tab body. An actor who may administer Roles gets the editable surface
 * once the datasets it edits have arrived; everyone else — and everyone still
 * waiting on those datasets — gets the read-only card.
 */
export const RolesTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const { canManageRoles } = useAccessCapabilities();
  const permissions = useAccessPermissions();
  const roles = useAccessRoles();

  if (!canManageRoles || !roles.isReady || !permissions.isReady) {
    return <RolesDatasetCard dataset={roles} />;
  }

  return (
    <section aria-label={t('roles.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <CreateRoleAction />
        <TransferManagerAction />
      </div>
      <RoleDirectory permissions={permissions.items} roles={roles.items} />
      <MemberAssignmentList />
    </section>
  );
};
