import type { WorkspaceRole } from '@warehouser/contracts/workspaces';
import { WorkspaceRoleEditor } from 'modules/access/components/workspace-administration/roles/WorkspaceRoleEditor';
import { WorkspaceRoleList } from 'modules/access/components/workspace-administration/roles/WorkspaceRoleList';
import type { ReactElement } from 'react';
import { useState } from 'react';

type WorkspaceRoleDirectoryProps = {
  roles: WorkspaceRole[];
};

const defaultRoleId = (roles: WorkspaceRole[]): string | undefined =>
  roles.find((role) => role.kind === 'custom')?.id ?? roles[0]?.id;

/**
 * The Workspace Role list beside the editor for the selected Role. The
 * selection is local to this pair — nothing outside reads it — and is derived
 * on every render, so deleting the selected Role cannot leave a stale id
 * behind.
 */
export const WorkspaceRoleDirectory = ({
  roles,
}: WorkspaceRoleDirectoryProps): ReactElement => {
  const [selectedRoleId, setSelectedRoleId] = useState(() =>
    defaultRoleId(roles),
  );
  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0];

  // The editor reads the Role it was opened for, so it is resolved here rather
  // than gated inline: `Conditional` evaluates both arms, and no Role exists
  // until the list has one to select.
  const roleEditor = !selectedRole ? null : (
    // Keying by Role id remounts the editor on a selection change, so the
    // form re-seeds from the newly selected Role without an effect that
    // resets it — and a background refresh cannot discard edits in
    // progress on the Role that is still selected.
    <WorkspaceRoleEditor
      key={selectedRole.id}
      replacements={roles.filter(
        (role) => role.kind === 'custom' && role.id !== selectedRole.id,
      )}
      role={selectedRole}
    />
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <WorkspaceRoleList
        roles={roles}
        selectedRoleId={selectedRole?.id}
        onSelect={setSelectedRoleId}
      />

      {roleEditor}
    </div>
  );
};
