import { PermissionId } from '@warehouser/shared-types/enums';
import { useState } from 'react';

import { MemberRoleActions } from 'modules/access/components/access-administration/components/members/MemberRoleActions';
import { RoleEditor } from 'modules/access/components/access-administration/components/roles/RoleEditor';
import { RoleList } from 'modules/access/components/access-administration/components/roles/RoleList';
import { PermissionGate } from 'shared/components/PermissionGate';
import { hasPermission } from 'shared/hooks/usePermissions';

import type {
  AccessMember,
  AccessPermission,
  AccessRole,
  OpenAccessWorkflow,
  SaveRole,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type RolesPanelProps = {
  members: AccessMember[];
  permissionIds: readonly string[];
  permissions: AccessPermission[];
  roles: AccessRole[];
  onOpenWorkflow: OpenAccessWorkflow;
  onSaveRole: SaveRole;
};

const defaultRoleId = (roles: AccessRole[]): string | undefined =>
  roles.find((role) => role.kind === 'custom')?.id ?? roles[0]?.id;

/**
 * Roles half of the administration surface: the searchable role list and the
 * editor for the selected role. Both the search term and the selection are
 * local to this panel — nothing outside it reads them.
 */
export const RolesPanel = ({
  members,
  permissionIds,
  permissions,
  roles,
  onOpenWorkflow,
  onSaveRole,
}: RolesPanelProps): ReactElement => {
  const [query, setQuery] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState(() =>
    defaultRoleId(roles),
  );
  // Deleting the selected role leaves a stale id behind, so the selection is
  // derived on every render instead of being resynced by an effect.
  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0];

  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-[370px_minmax(0,1fr)]">
        <RoleList
          query={query}
          roles={roles}
          selectedRoleId={selectedRole?.id}
          onQueryChange={setQuery}
          onSelect={setSelectedRoleId}
        />
        {selectedRole ? (
          // Keying by role id remounts the editor on a selection change, so the
          // form re-seeds from the newly selected role without an effect that
          // resets it — and a background refresh can no longer discard edits in
          // progress on the role that is still selected.
          <RoleEditor
            key={selectedRole.id}
            canDelete={hasPermission(permissionIds, PermissionId.ROLES_DELETE)}
            canUpdate={hasPermission(permissionIds, PermissionId.ROLES_UPDATE)}
            permissions={permissions}
            role={selectedRole}
            onDelete={() =>
              onOpenWorkflow({ kind: 'delete', role: selectedRole })
            }
            onSave={(input) => onSaveRole(input, selectedRole.id)}
          />
        ) : null}
      </div>

      <PermissionGate
        permission={PermissionId.ROLES_ASSIGN}
        permissionIds={permissionIds}
      >
        <MemberRoleActions
          members={members}
          onAssign={(memberId) => onOpenWorkflow({ kind: 'assign', memberId })}
        />
      </PermissionGate>
    </>
  );
};
