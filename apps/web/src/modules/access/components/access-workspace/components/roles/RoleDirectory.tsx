import { useState } from 'react';

import { DeleteRoleDialog } from 'modules/access/components/access-workspace/components/roles/DeleteRoleDialog';
import { RoleEditor } from 'modules/access/components/access-workspace/components/roles/RoleEditor';
import { RoleList } from 'modules/access/components/access-workspace/components/roles/RoleList';
import { useDeleteRole } from 'modules/access/hooks/mutations/useDeleteRole';
import { useSaveRole } from 'modules/access/hooks/mutations/useSaveRole';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';

import type { RoleWrite } from '@warehouser/contracts/access';
import type {
  AccessPermission,
  AccessRole,
} from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

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
  const { canDeleteRoles, canUpdateRoles, isArchived, warehouseId } =
    useAccessCapabilities();
  const saveRole = useSaveRole(warehouseId ?? '');
  const deleteRole = useDeleteRole(warehouseId ?? '');
  // An archived Warehouse's Roles start unselected: nothing here is editable,
  // so nothing opens the editor pane by default (AC-12a) — the actor still
  // reads a Role's grants by selecting it from the list.
  const [selectedRoleId, setSelectedRoleId] = useState(() =>
    isArchived ? undefined : defaultRoleId(roles),
  );
  const [rolePendingDeletion, setRolePendingDeletion] =
    useState<AccessRole | null>(null);
  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0];

  const onDeleteRole = (role: AccessRole) => (): void =>
    setRolePendingDeletion(role);

  const onCloseDeletion = (): void => setRolePendingDeletion(null);

  const onSaveRole =
    (roleId: string) =>
    (input: RoleWrite): Promise<MutationOutcome> =>
      saveRole(input, roleId);

  const onConfirmDeletion =
    (role: AccessRole) =>
    async (replacementRoleId: string | null): Promise<void> => {
      const outcome = await deleteRole(role.id, replacementRoleId);
      if (outcome.success) {
        onCloseDeletion();
      }
    };

  // Both panes read the record they were opened for, so each is resolved here
  // rather than gated inline: `Conditional` evaluates both arms, and neither
  // record exists until something is selected.
  const roleEditor = !selectedRole ? null : (
    // Keying by Role id remounts the editor on a selection change, so the
    // form re-seeds from the newly selected Role without an effect that
    // resets it — and a background refresh can no longer discard edits in
    // progress on the Role that is still selected.
    <RoleEditor
      key={selectedRole.id}
      canDelete={canDeleteRoles && !isArchived}
      canUpdate={canUpdateRoles && !isArchived}
      permissions={permissions}
      role={selectedRole}
      onDelete={onDeleteRole(selectedRole)}
      onSave={onSaveRole(selectedRole.id)}
    />
  );

  const deleteRoleDialog =
    rolePendingDeletion === null ? null : (
      <DeleteRoleDialog
        role={rolePendingDeletion}
        roles={roles.filter((role) => role.kind === 'custom')}
        onClose={onCloseDeletion}
        onDelete={onConfirmDeletion(rolePendingDeletion)}
      />
    );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[370px_minmax(0,1fr)]">
      <RoleList
        roles={roles}
        selectedRoleId={selectedRole?.id}
        onSelect={setSelectedRoleId}
      />

      {roleEditor}

      {deleteRoleDialog}
    </div>
  );
};
