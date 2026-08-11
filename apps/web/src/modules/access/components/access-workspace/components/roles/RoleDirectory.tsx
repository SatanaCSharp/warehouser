import { useState } from 'react';

import { DeleteRoleDialog } from 'modules/access/components/access-workspace/components/roles/DeleteRoleDialog';
import { RoleEditor } from 'modules/access/components/access-workspace/components/roles/RoleEditor';
import { RoleList } from 'modules/access/components/access-workspace/components/roles/RoleList';
import { useAccessCapabilities } from 'modules/access/hooks/useAccessCapabilities';
import { useDeleteRole } from 'modules/access/hooks/useDeleteRole';
import { useSaveRole } from 'modules/access/hooks/useSaveRole';

import type {
  AccessPermission,
  AccessRole,
} from 'modules/access/types/access.types';
import type { ReactElement } from 'react';

type RoleDirectoryProps = {
  permissions: AccessPermission[];
  roles: AccessRole[];
};

const defaultRoleId = (roles: AccessRole[]): string | undefined =>
  roles.find((role) => role.kind === 'custom')?.id ?? roles[0]?.id;

/**
 * The Role list beside the editor for the selected Role. The selection is local
 * to this pair — nothing outside reads it — and is derived on every render, so
 * deleting the selected Role cannot leave a stale id behind.
 */
export const RoleDirectory = ({
  permissions,
  roles,
}: RoleDirectoryProps): ReactElement => {
  const { canDeleteRoles, canUpdateRoles } = useAccessCapabilities();
  const saveRole = useSaveRole();
  const deleteRole = useDeleteRole();
  const [selectedRoleId, setSelectedRoleId] = useState(() =>
    defaultRoleId(roles),
  );
  const [rolePendingDeletion, setRolePendingDeletion] =
    useState<AccessRole | null>(null);
  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[370px_minmax(0,1fr)]">
      <RoleList
        roles={roles}
        selectedRoleId={selectedRole?.id}
        onSelect={setSelectedRoleId}
      />

      {selectedRole ? (
        // Keying by Role id remounts the editor on a selection change, so the
        // form re-seeds from the newly selected Role without an effect that
        // resets it — and a background refresh can no longer discard edits in
        // progress on the Role that is still selected.
        <RoleEditor
          key={selectedRole.id}
          canDelete={canDeleteRoles}
          canUpdate={canUpdateRoles}
          permissions={permissions}
          role={selectedRole}
          onDelete={() => setRolePendingDeletion(selectedRole)}
          onSave={(input) => saveRole(input, selectedRole.id)}
        />
      ) : null}

      {rolePendingDeletion ? (
        <DeleteRoleDialog
          role={rolePendingDeletion}
          roles={roles.filter((role) => role.kind === 'custom')}
          onClose={() => setRolePendingDeletion(null)}
          onDelete={async (replacementRoleId) => {
            const outcome = await deleteRole(
              rolePendingDeletion.id,
              replacementRoleId,
            );
            if (outcome.success) {
              setRolePendingDeletion(null);
            }
          }}
        />
      ) : null}
    </div>
  );
};
