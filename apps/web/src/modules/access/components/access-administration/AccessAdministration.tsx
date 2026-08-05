import { Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AssignmentDialog } from 'modules/access/components/access-administration/AssignmentDialog';
import { DeletionDialog } from 'modules/access/components/access-administration/DeletionDialog';
import { MemberRoleActions } from 'modules/access/components/access-administration/MemberRoleActions';
import { RoleDialog } from 'modules/access/components/access-administration/RoleDialog';
import { RoleEditor } from 'modules/access/components/access-administration/RoleEditor';
import { RoleList } from 'modules/access/components/access-administration/RoleList';
import { TransferDialog } from 'modules/access/components/access-administration/TransferDialog';

import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import type {
  AccessRole,
  MutationOutcome,
  SaveRole,
} from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

export type { MutationOutcome } from 'modules/access/types/access-administration.types';

export type AccessAdministrationProps = {
  access: AccessProjection;
  members: MemberPage['items'];
  permissions: PermissionPage['items'];
  roles: RolePage['items'];
  onAssignRole: (userId: string, roleId: string) => Promise<MutationOutcome>;
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
  | { kind: 'delete'; role: AccessRole }
  | { kind: 'role'; role?: AccessRole }
  | { kind: 'transfer' }
  | null;

export const AccessAdministration = ({
  access,
  members,
  permissions,
  roles,
  onAssignRole,
  onDeleteRole,
  onSaveRole,
  onTransferManager,
}: AccessAdministrationProps): ReactElement => {
  const { t } = useTranslation('access');
  const [workflow, setWorkflow] = useState<Workflow>(null);
  const [announcement, setAnnouncement] = useState('');
  const [query, setQuery] = useState('');
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

  useEffect(() => {
    if (!roles.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(roles[0]?.id);
    }
  }, [roles, selectedRoleId]);

  return (
    <section aria-label={t('roles.heading')}>
      <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap gap-2">
          {can(PermissionId.ROLES_CREATE) ? (
            <Button
              color="primary"
              className="min-w-40 font-semibold"
              size="lg"
              onPress={() => setWorkflow({ kind: 'role' })}
            >
              {t('administration.createRole')}
            </Button>
          ) : null}
          {can(PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN) ? (
            <Button
              variant="bordered"
              onPress={() => setWorkflow({ kind: 'transfer' })}
            >
              {t('administration.transfer.open')}
            </Button>
          ) : null}
        </div>
      </div>

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
            onDelete={() => setWorkflow({ kind: 'delete', role: selectedRole })}
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

      {can(PermissionId.ROLES_ASSIGN) ? (
        <MemberRoleActions
          members={members}
          onAssign={(memberId) => setWorkflow({ kind: 'assign', memberId })}
        />
      ) : null}

      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      {workflow?.kind === 'role' ? (
        <RoleDialog
          permissions={permissions}
          role={workflow.role}
          onClose={closeWorkflow}
          onSave={async (input) => {
            const result = await onSaveRole(input, workflow.role?.id);
            if (!result.success) {
              return result;
            }
            setAnnouncement(
              t('administration.roleSaved', { name: input.name }),
            );
            closeWorkflow();
            return result;
          }}
        />
      ) : null}
      {workflow?.kind === 'assign' ? (
        <AssignmentDialog
          memberId={workflow.memberId}
          roles={customRoles}
          onClose={closeWorkflow}
          onSave={async (roleId) => {
            const result = await onAssignRole(workflow.memberId, roleId);
            if (result.success) {
              setAnnouncement(t('administration.assignment.saved'));
              closeWorkflow();
            }
          }}
        />
      ) : null}
      {workflow?.kind === 'delete' ? (
        <DeletionDialog
          role={workflow.role}
          roles={customRoles}
          onClose={closeWorkflow}
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
            setAnnouncement(
              replacement
                ? t('administration.deletion.replaced', {
                    role: workflow.role.name,
                    replacement: replacement.name,
                  })
                : t('administration.deletion.deleted', {
                    role: workflow.role.name,
                  }),
            );
            closeWorkflow();
          }}
        />
      ) : null}
      {workflow?.kind === 'transfer' ? (
        <TransferDialog
          access={access}
          members={members}
          roles={customRoles}
          onClose={closeWorkflow}
          onTransfer={async (recipientId, replacementRoleId) => {
            const result = await onTransferManager(
              recipientId,
              replacementRoleId,
            );
            if (result.success) {
              setAnnouncement(t('administration.transfer.saved'));
              closeWorkflow();
            }
          }}
        />
      ) : null}
    </section>
  );
};
