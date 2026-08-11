import { MembersPanel } from 'modules/access/components/access-administration/components/members/MembersPanel';
import { MemberToolbarActions } from 'modules/access/components/access-administration/components/members/MemberToolbarActions';
import { MemberWorkflowDialogs } from 'modules/access/components/access-administration/components/members/MemberWorkflowDialogs';
import { RolesPanel } from 'modules/access/components/access-administration/components/roles/RolesPanel';
import { RoleToolbarActions } from 'modules/access/components/access-administration/components/roles/RoleToolbarActions';
import { RoleWorkflowDialogs } from 'modules/access/components/access-administration/components/roles/RoleWorkflowDialogs';

import type { AccessProjection } from '@warehouser/contracts/access';
import type {
  AccessAdministrationActions,
  AccessMember,
  AccessPermission,
  AccessRole,
  AccessWorkflow,
  OpenAccessWorkflow,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

/** Everything a section may need. A section reads only the parts it uses. */
export type AccessSectionContext = {
  access: AccessProjection;
  actions: AccessAdministrationActions;
  customRoles: AccessRole[];
  isLoading: boolean;
  members: AccessMember[];
  permissions: AccessPermission[];
  roles: AccessRole[];
  workflow: AccessWorkflow | null;
  onCloseWorkflow: () => void;
  onOpenWorkflow: OpenAccessWorkflow;
};

type AccessSectionSlot = (context: AccessSectionContext) => ReactElement | null;

/**
 * One administration domain, described in the three places it shows up. Adding
 * a domain means adding an entry here and listing it in a view below — never
 * another branch in `AccessAdministration`.
 */
export type AccessSection = {
  id: string;
  /** Workflow dialogs the section owns; renders nothing for other sections'. */
  Dialogs: AccessSectionSlot;
  /** The section's body. */
  Panel: AccessSectionSlot;
  /** Triggers the section contributes to the surface's shared toolbar. */
  Toolbar: AccessSectionSlot;
};

const rolesSection: AccessSection = {
  id: 'roles',
  Toolbar: ({ access, onOpenWorkflow }) => (
    <RoleToolbarActions
      permissionIds={access.permissionIds}
      onOpenWorkflow={onOpenWorkflow}
    />
  ),
  Panel: ({ access, actions, members, permissions, roles, onOpenWorkflow }) => (
    <RolesPanel
      members={members}
      permissionIds={access.permissionIds}
      permissions={permissions}
      roles={roles}
      onOpenWorkflow={onOpenWorkflow}
      onSaveRole={actions.onSaveRole}
    />
  ),
  Dialogs: ({
    access,
    actions,
    customRoles,
    members,
    permissions,
    workflow,
    onCloseWorkflow,
  }) => (
    <RoleWorkflowDialogs
      access={access}
      customRoles={customRoles}
      members={members}
      permissions={permissions}
      workflow={workflow}
      onAssignRole={actions.onAssignRole}
      onClose={onCloseWorkflow}
      onDeleteRole={actions.onDeleteRole}
      onSaveRole={actions.onSaveRole}
      onTransferManager={actions.onTransferManager}
    />
  ),
};

const membersSection: AccessSection = {
  id: 'members',
  Toolbar: ({ access, onOpenWorkflow }) => (
    <MemberToolbarActions
      permissionIds={access.permissionIds}
      onOpenWorkflow={onOpenWorkflow}
    />
  ),
  Panel: ({ access, isLoading, members, roles, onOpenWorkflow }) => (
    <MembersPanel
      isLoading={isLoading}
      members={members}
      permissionIds={access.permissionIds}
      roles={roles}
      onOpenWorkflow={onOpenWorkflow}
    />
  ),
  Dialogs: ({ actions, customRoles, workflow, onCloseWorkflow }) => (
    <MemberWorkflowDialogs
      customRoles={customRoles}
      workflow={workflow}
      onChangeMemberEmail={actions.onChangeMemberEmail}
      onChangeMemberPassword={actions.onChangeMemberPassword}
      onClose={onCloseWorkflow}
      onCreateMember={actions.onCreateMember}
      onDeleteMember={actions.onDeleteMember}
    />
  ),
};

/** Which sections each view of the administration surface composes. */
export const accessViewSections = {
  all: [rolesSection, membersSection],
  members: [membersSection],
  roles: [rolesSection],
} as const satisfies Record<string, readonly AccessSection[]>;

export type AccessView = keyof typeof accessViewSections;
