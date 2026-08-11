import { AccessAdministration } from 'modules/access/components/access-administration/AccessAdministration';
import { RolesDatasetCard } from 'modules/access/components/access-workspace/components/AccessDatasetCards';

import type { AccessWorkspaceContext } from 'modules/access/hooks/useAccessWorkspace';
import type { ReactElement } from 'react';

/**
 * Roles tab body. An actor who may administer Roles gets the administration
 * surface once the datasets it edits have arrived; everyone else — and everyone
 * still waiting on those datasets — gets the read-only card.
 */
export const RolesTabPanel = ({
  access,
  actions,
  capabilities,
  members,
  permissions,
  roles,
}: AccessWorkspaceContext): ReactElement => {
  if (!capabilities.canManageRoles || !roles.data || !permissions.data) {
    return <RolesDatasetCard query={roles} />;
  }

  return (
    <AccessAdministration
      access={access}
      members={members.data?.items ?? []}
      permissions={permissions.data.items}
      roles={roles.data.items}
      view="roles"
      {...actions}
    />
  );
};
