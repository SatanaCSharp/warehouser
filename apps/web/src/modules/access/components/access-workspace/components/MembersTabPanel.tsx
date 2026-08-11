import { AccessAdministration } from 'modules/access/components/access-administration/AccessAdministration';
import { MembersDatasetCard } from 'modules/access/components/access-workspace/components/AccessDatasetCards';

import type { AccessWorkspaceContext } from 'modules/access/hooks/useAccessWorkspace';
import type { ReactElement } from 'react';

/**
 * Members tab body. Reading Members is enough for the administration surface —
 * it hides the actions the actor cannot perform itself — so the read-only card
 * only stands in while the Members dataset is still on its way.
 */
export const MembersTabPanel = ({
  access,
  actions,
  capabilities,
  members,
  permissions,
  roles,
}: AccessWorkspaceContext): ReactElement => {
  if (!capabilities.canReadMembers || !members.data) {
    return <MembersDatasetCard query={members} />;
  }

  return (
    <AccessAdministration
      access={access}
      isLoading={members.isFetching}
      members={members.data.items}
      permissions={permissions.data?.items ?? []}
      roles={roles.data?.items ?? []}
      view="members"
      {...actions}
    />
  );
};
