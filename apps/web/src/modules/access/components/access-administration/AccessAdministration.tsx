import { Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AssignmentDialog } from 'modules/access/components/access-administration/AssignmentDialog';
import { CreateMemberDialog } from 'modules/access/components/access-administration/CreateMemberDialog';
import { DeleteMemberDialog } from 'modules/access/components/access-administration/DeleteMemberDialog';
import { DeletionDialog } from 'modules/access/components/access-administration/DeletionDialog';
import { EditEmailDialog } from 'modules/access/components/access-administration/EditEmailDialog';
import { MemberList } from 'modules/access/components/access-administration/MemberList';
import { MemberRoleActions } from 'modules/access/components/access-administration/MemberRoleActions';
import { ResetPasswordDialog } from 'modules/access/components/access-administration/ResetPasswordDialog';
import { RoleDialog } from 'modules/access/components/access-administration/RoleDialog';
import { RoleEditor } from 'modules/access/components/access-administration/RoleEditor';
import { RoleList } from 'modules/access/components/access-administration/RoleList';
import { TransferDialog } from 'modules/access/components/access-administration/TransferDialog';
import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { useAppSelector } from 'store/hooks';

import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import type {
  CreateMemberInput,
  EmailChangeInput,
  PasswordChangeInput,
} from '@warehouser/contracts/users';
import type {
  AccessMember,
  AccessRole,
  MutationOutcome,
  SaveRole,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

export type { MutationOutcome } from 'modules/access/types/access-administration.types';

export type AccessAdministrationProps = {
  access: AccessProjection;
  isLoading?: boolean;
  members: MemberPage['items'];
  permissions: PermissionPage['items'];
  roles: RolePage['items'];
  view?: 'all' | 'members' | 'roles';
  onAssignRole: (userId: string, roleId: string) => Promise<MutationOutcome>;
  onChangeMemberEmail: (
    userId: string,
    input: EmailChangeInput,
  ) => Promise<MutationOutcome>;
  onChangeMemberPassword: (
    userId: string,
    input: PasswordChangeInput,
  ) => Promise<MutationOutcome>;
  onCreateMember: (input: CreateMemberInput) => Promise<MutationOutcome>;
  onDeleteMember: (userId: string) => Promise<MutationOutcome>;
  onDeleteRole: (
    roleId: string,
    replacementRoleId: string | null,
  ) => Promise<MutationOutcome>;
  onSaveRole: SaveRole;
  onTransferManager: (
    recipientUserId: string,
    formerManagerRoleId: string,
  ) => Promise<MutationOutcome>;
};

type Workflow =
  | { kind: 'assign'; memberId: string }
  | { kind: 'create' }
  | { kind: 'delete'; role: AccessRole }
  | { kind: 'deleteMember'; member: AccessMember }
  | { kind: 'editEmail'; member: AccessMember }
  | { kind: 'resetPassword'; member: AccessMember }
  | { kind: 'role'; role?: AccessRole }
  | { kind: 'transfer' }
  | null;

type WorkflowDialogsProps = Pick<
  AccessAdministrationProps,
  | 'access'
  | 'members'
  | 'onAssignRole'
  | 'onChangeMemberEmail'
  | 'onChangeMemberPassword'
  | 'onCreateMember'
  | 'onDeleteMember'
  | 'onDeleteRole'
  | 'onSaveRole'
  | 'onTransferManager'
  | 'permissions'
> & {
  customRoles: AccessRole[];
  workflow: Workflow;
  onAnnounce: (message: string) => void;
  onClose: () => void;
};

const WorkflowDialogs = ({
  access,
  customRoles,
  members,
  permissions,
  workflow,
  onAnnounce,
  onAssignRole,
  onChangeMemberEmail,
  onChangeMemberPassword,
  onClose,
  onCreateMember,
  onDeleteMember,
  onDeleteRole,
  onSaveRole,
  onTransferManager,
}: WorkflowDialogsProps): ReactElement | null => {
  const { t } = useTranslation('access');

  if (!workflow) {
    return null;
  }

  if (workflow.kind === 'role') {
    return (
      <RoleDialog
        permissions={permissions}
        role={workflow.role}
        onClose={onClose}
        onSave={async (input) => {
          const result = await onSaveRole(input, workflow.role?.id);
          if (!result.success) {
            return result;
          }
          onAnnounce(t('administration.roleSaved', { name: input.name }));
          onClose();
          return result;
        }}
      />
    );
  }
  if (workflow.kind === 'assign') {
    return (
      <AssignmentDialog
        memberId={workflow.memberId}
        roles={customRoles}
        onClose={onClose}
        onSave={async (roleId) => {
          const result = await onAssignRole(workflow.memberId, roleId);
          if (result.success) {
            onAnnounce(t('administration.assignment.saved'));
            onClose();
          }
        }}
      />
    );
  }
  if (workflow.kind === 'delete') {
    return (
      <DeletionDialog
        role={workflow.role}
        roles={customRoles}
        onClose={onClose}
        onDelete={async (replacementRoleId) => {
          const result = await onDeleteRole(
            workflow.role.id,
            replacementRoleId,
          );
          if (!result.success) {
            return;
          }
          const replacement = customRoles.find(
            (role) => role.id === replacementRoleId,
          );
          onAnnounce(
            replacement
              ? t('administration.deletion.replaced', {
                  role: workflow.role.name,
                  replacement: replacement.name,
                })
              : t('administration.deletion.deleted', {
                  role: workflow.role.name,
                }),
          );
          onClose();
        }}
      />
    );
  }
  if (workflow.kind === 'create') {
    return (
      <CreateMemberDialog
        roles={customRoles}
        onClose={onClose}
        onSave={onCreateMember}
      />
    );
  }
  if (workflow.kind === 'editEmail') {
    return (
      <EditEmailDialog
        member={workflow.member}
        onClose={onClose}
        onSave={(input) => onChangeMemberEmail(workflow.member.userId, input)}
      />
    );
  }
  if (workflow.kind === 'resetPassword') {
    return (
      <ResetPasswordDialog
        member={workflow.member}
        onClose={onClose}
        onSave={(input) =>
          onChangeMemberPassword(workflow.member.userId, input)
        }
      />
    );
  }
  if (workflow.kind === 'deleteMember') {
    return (
      <DeleteMemberDialog
        member={workflow.member}
        onClose={onClose}
        onDelete={() => onDeleteMember(workflow.member.userId)}
      />
    );
  }
  return (
    <TransferDialog
      access={access}
      members={members}
      roles={customRoles}
      onClose={onClose}
      onTransfer={async (recipientId, replacementRoleId) => {
        const result = await onTransferManager(recipientId, replacementRoleId);
        if (result.success) {
          onAnnounce(t('administration.transfer.saved'));
          onClose();
        }
      }}
    />
  );
};

export const AccessAdministration = ({
  access,
  isLoading = false,
  members,
  permissions,
  roles,
  view = 'all',
  onAssignRole,
  onChangeMemberEmail,
  onChangeMemberPassword,
  onCreateMember,
  onDeleteMember,
  onDeleteRole,
  onSaveRole,
  onTransferManager,
}: AccessAdministrationProps): ReactElement => {
  const { t } = useTranslation('access');
  const currentUser = useAppSelector(selectCurrentUser);
  // Self-row gating (AC-11/AC-18) must never fall back to treating every row
  // as not-self while the auth store hasn't hydrated yet — defer the member
  // list to a loading skeleton instead of rendering live destructive
  // controls against an unresolved actor id.
  const actorUserId = currentUser?.id ?? '';
  const membersLoading = isLoading || currentUser === null;
  const [workflow, setWorkflow] = useState<Workflow>(null);
  const [announcement, setAnnouncement] = useState('');
  const [query, setQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState(
    () => roles.find((role) => role.kind === 'custom')?.id ?? roles[0]?.id,
  );
  const customRoles = useMemo(
    () => roles.filter((role) => role.kind === 'custom'),
    [roles],
  );
  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0];
  const can = (permission: string): boolean =>
    access.permissionIds.includes(permission);
  const closeWorkflow = (): void => setWorkflow(null);
  const showRoles = view !== 'members';
  const showMembers = view !== 'roles';

  useEffect(() => {
    if (!roles.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(roles[0]?.id);
    }
  }, [roles, selectedRoleId]);

  return (
    <section aria-label={t('roles.heading')}>
      <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          {showRoles && can(PermissionId.ROLES_CREATE) ? (
            <Button
              color="primary"
              className="min-w-40 font-semibold"
              size="lg"
              onPress={() => setWorkflow({ kind: 'role' })}
            >
              {t('administration.createRole')}
            </Button>
          ) : null}
          {showRoles && can(PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN) ? (
            <Button
              variant="bordered"
              onPress={() => setWorkflow({ kind: 'transfer' })}
            >
              {t('administration.transfer.open')}
            </Button>
          ) : null}
          {showMembers && can(PermissionId.USERS_CREATE) ? (
            <Button
              color="primary"
              className="min-w-40 font-semibold"
              size="lg"
              onPress={() => setWorkflow({ kind: 'create' })}
            >
              {t('administration.createMember.open')}
            </Button>
          ) : null}
        </div>
      </div>

      {showRoles ? (
        <div className="grid items-start gap-5 lg:grid-cols-[370px_minmax(0,1fr)]">
          <RoleList
            query={query}
            roles={roles}
            selectedRoleId={selectedRole?.id}
            onQueryChange={setQuery}
            onSelect={setSelectedRoleId}
          />
          {selectedRole ? (
            <RoleEditor
              canDelete={can(PermissionId.ROLES_DELETE)}
              canUpdate={can(PermissionId.ROLES_UPDATE)}
              permissions={permissions}
              role={selectedRole}
              onDelete={() =>
                setWorkflow({ kind: 'delete', role: selectedRole })
              }
              onSave={async (input) => {
                const result = await onSaveRole(input, selectedRole.id);
                if (result.success) {
                  setAnnouncement(
                    t('administration.roleSaved', { name: input.name }),
                  );
                }
                return result;
              }}
            />
          ) : null}
        </div>
      ) : null}

      {showRoles && can(PermissionId.ROLES_ASSIGN) ? (
        <MemberRoleActions
          members={members}
          onAssign={(memberId) => setWorkflow({ kind: 'assign', memberId })}
        />
      ) : null}

      {showMembers ? (
        <MemberList
          actorUserId={actorUserId}
          canDeleteMember={can(PermissionId.USERS_DELETE)}
          canEditEmail={can(PermissionId.USERS_EMAIL_UPDATE)}
          canResetPassword={can(PermissionId.USERS_PASSWORD_CHANGE)}
          isLoading={membersLoading}
          members={members}
          query={memberQuery}
          roles={roles}
          onDeleteMember={(member) =>
            setWorkflow({ kind: 'deleteMember', member })
          }
          onEditEmail={(member) => setWorkflow({ kind: 'editEmail', member })}
          onQueryChange={setMemberQuery}
          onResetPassword={(member) =>
            setWorkflow({ kind: 'resetPassword', member })
          }
        />
      ) : null}

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      <WorkflowDialogs
        access={access}
        customRoles={customRoles}
        members={members}
        permissions={permissions}
        workflow={workflow}
        onAnnounce={setAnnouncement}
        onAssignRole={onAssignRole}
        onChangeMemberEmail={onChangeMemberEmail}
        onChangeMemberPassword={onChangeMemberPassword}
        onClose={closeWorkflow}
        onCreateMember={onCreateMember}
        onDeleteMember={onDeleteMember}
        onDeleteRole={onDeleteRole}
        onSaveRole={onSaveRole}
        onTransferManager={onTransferManager}
      />
    </section>
  );
};
