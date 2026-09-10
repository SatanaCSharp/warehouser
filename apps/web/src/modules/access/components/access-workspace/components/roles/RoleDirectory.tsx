import type { RoleWrite } from '@warehouser/contracts/access';
import {
  useDeleteAccessRoleMutation,
  useUpdateAccessRoleMutation,
} from 'modules/access/api/access-api';
import { DeleteRoleDialog } from 'modules/access/components/access-workspace/components/roles/DeleteRoleDialog';
import { RoleEditor } from 'modules/access/components/access-workspace/components/roles/RoleEditor';
import { RoleList } from 'modules/access/components/access-workspace/components/roles/RoleList';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import type { AccessRole } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import { useState } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

type RoleDirectoryProps = {
  roles: AccessRole[];
};

/** The one dialog a Role row opens. */
type RoleDialogKind = 'deleteRole';

const defaultRoleId = (roles: AccessRole[]): string | undefined =>
  roles.find((role) => role.kind === 'custom')?.id ?? roles[0]?.id;

/**
 * The Role list beside the editor for the selected Role. The selection is local
 * to this pair — nothing outside reads it — and is derived on every render, so
 * deleting the selected Role cannot leave a stale id behind.
 */
export const RoleDirectory = ({ roles }: RoleDirectoryProps): ReactElement => {
  const { isArchived, warehouseId } = useAccessScope();
  const [updateRole] = useUpdateAccessRoleMutation();
  const [deleteRole] = useDeleteAccessRoleMutation();
  // An archived Warehouse's Roles start unselected: nothing here is editable,
  // so nothing opens the editor pane by default (AC-12a) — the actor still
  // reads a Role's grants by selecting it from the list.
  const [selectedRoleId, setSelectedRoleId] = useState(() =>
    isArchived ? undefined : defaultRoleId(roles),
  );
  const dialog = useActionDialog<RoleDialogKind, AccessRole>();
  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0];

  const onDeleteRole = (role: AccessRole) => (): void =>
    dialog.open('deleteRole', role);

  const onSaveRole =
    (roleId: string) =>
    (input: RoleWrite): Promise<MutationResult> =>
      updateRole({ warehouseId: warehouseId ?? '', roleId, input });

  const onConfirmDeletion =
    (role: AccessRole) =>
    (replacementRoleId: string | null): Promise<MutationResult> =>
      deleteRole({
        warehouseId: warehouseId ?? '',
        roleId: role.id,
        input: { replacementRoleId },
      });

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
      role={selectedRole}
      onDelete={onDeleteRole(selectedRole)}
      onSave={onSaveRole(selectedRole.id)}
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

      <ActionDialogHost
        controller={dialog}
        renderDialogs={{
          deleteRole: (role) => (
            <DeleteRoleDialog
              role={role}
              roles={roles.filter((candidate) => candidate.kind === 'custom')}
              onDelete={onConfirmDeletion(role)}
            />
          ),
        }}
      />
    </div>
  );
};
