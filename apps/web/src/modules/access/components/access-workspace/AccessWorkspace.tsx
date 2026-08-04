/* eslint-disable complexity, max-lines-per-function -- Dataset authority and states stay coordinated at this route-level owner. */
import { Card, CardBody, CardHeader, Skeleton, Tab, Tabs } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { alertAccessSuccess } from 'modules/access/alerts/access-feedback';
import {
  useListAccessMembersQuery,
  useListAccessPermissionsQuery,
  useListAccessRolesQuery,
  useAssignAccessMemberRoleMutation,
  useCreateAccessRoleMutation,
  useDeleteAccessRoleMutation,
  useTransferWarehouseManagerMutation,
  useUpdateAccessRoleMutation,
} from 'modules/access/api/access-api';
import { AccessAdministration } from 'modules/access/components/access-administration/AccessAdministration';
import { isApiFailure } from 'shared/api/api-client';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { ReactElement } from 'react';

type AccessWorkspaceProps = { access: AccessProjection };

const administrationPermissions: readonly string[] = [
  PermissionId.ROLES_ASSIGN,
  PermissionId.ROLES_CREATE,
  PermissionId.ROLES_DELETE,
  PermissionId.ROLES_UPDATE,
  PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
];

const LoadingList = (): ReactElement => (
  <div aria-label="Loading access data" className="space-y-3">
    <Skeleton className="h-16 rounded-medium" />
    <Skeleton className="h-16 rounded-medium" />
  </div>
);

const DatasetState = ({
  kind,
  label,
}: {
  kind: 'empty' | 'error';
  label: string;
}): ReactElement => (
  <p
    role={kind === 'error' ? 'alert' : 'status'}
    className="py-6 text-foreground-500"
  >
    {label}
  </p>
);

export const AccessWorkspace = ({
  access,
}: AccessWorkspaceProps): ReactElement => {
  const { t } = useTranslation('access');
  const canReadRoles = access.permissionIds.includes(PermissionId.ROLES_WATCH);
  const canManageRoles = access.permissionIds.some((permission) =>
    administrationPermissions.includes(permission),
  );
  const canLoadRoles = canReadRoles || canManageRoles;
  const canReadMembers = access.permissionIds.includes(
    PermissionId.USERS_WATCH,
  );
  const canManageMembers = access.permissionIds.some(
    (permission) =>
      permission === PermissionId.ROLES_ASSIGN ||
      permission === PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  );
  const canLoadPermissions = access.permissionIds.some(
    (permission) =>
      permission === PermissionId.ROLES_WATCH ||
      permission === PermissionId.ROLES_CREATE ||
      permission === PermissionId.ROLES_UPDATE,
  );
  const roles = useListAccessRolesQuery(undefined, { skip: !canLoadRoles });
  const permissions = useListAccessPermissionsQuery(undefined, {
    skip: !canLoadPermissions,
  });
  const members = useListAccessMembersQuery(undefined, {
    skip: !(canReadMembers || canManageMembers),
  });
  const [createRole] = useCreateAccessRoleMutation();
  const [updateRole] = useUpdateAccessRoleMutation();
  const [assignRole] = useAssignAccessMemberRoleMutation();
  const [deleteRole] = useDeleteAccessRoleMutation();
  const [transferManager] = useTransferWarehouseManagerMutation();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 lg:px-12">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">{t('heading')}</h1>
        <p className="mt-2 text-foreground-500">{t('description')}</p>
      </header>
      <Tabs
        aria-label={t('navigation.label')}
        color="primary"
        variant="underlined"
      >
        {canReadRoles ? (
          <Tab key="roles" title={t('navigation.roles')}>
            <Card className="border border-divider shadow-none">
              <CardHeader className="text-lg font-semibold">
                {t('roles.heading')}
              </CardHeader>
              <CardBody>
                {roles.isLoading ? (
                  <LoadingList />
                ) : roles.isError ? (
                  <DatasetState kind="error" label={t('roles.error')} />
                ) : roles.data?.items.length === 0 ? (
                  <DatasetState kind="empty" label={t('roles.empty')} />
                ) : (
                  <ul
                    className="divide-y divide-divider"
                    aria-label={t('roles.listLabel')}
                  >
                    {roles.data?.items.map((role) => (
                      <li className="py-4" key={role.id}>
                        <span className="font-medium">{role.name}</span>
                        {role.kind === 'warehouse_manager' ? (
                          <span className="ml-2 text-sm text-foreground-500">
                            {t('roles.protected')}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </Tab>
        ) : null}
        {canReadMembers ? (
          <Tab key="members" title={t('navigation.members')}>
            <Card className="border border-divider shadow-none">
              <CardHeader className="text-lg font-semibold">
                {t('members.heading')}
              </CardHeader>
              <CardBody>
                {members.isLoading ? (
                  <LoadingList />
                ) : members.isError ? (
                  <DatasetState kind="error" label={t('members.error')} />
                ) : members.data?.items.length === 0 ? (
                  <DatasetState kind="empty" label={t('members.empty')} />
                ) : (
                  <ul
                    className="divide-y divide-divider"
                    aria-label={t('members.listLabel')}
                  >
                    {members.data?.items.map((member) => (
                      <li
                        className="py-4 font-mono text-sm"
                        key={member.userId}
                      >
                        {member.userId}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </Tab>
        ) : null}
        {canReadRoles ? (
          <Tab key="permissions" title={t('navigation.permissions')}>
            <Card className="border border-divider shadow-none">
              <CardHeader className="text-lg font-semibold">
                {t('permissions.heading')}
              </CardHeader>
              <CardBody>
                {permissions.isLoading ? (
                  <LoadingList />
                ) : permissions.isError ? (
                  <DatasetState kind="error" label={t('permissions.error')} />
                ) : permissions.data?.items.length === 0 ? (
                  <DatasetState kind="empty" label={t('permissions.empty')} />
                ) : (
                  <ul
                    className="divide-y divide-divider"
                    aria-label={t('permissions.listLabel')}
                  >
                    {permissions.data?.items.map((permission) => (
                      <li className="py-4" key={permission.id}>
                        <span className="font-medium">{permission.label}</span>
                        <span className="ml-2 text-sm text-foreground-500">
                          {permission.id}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </Tab>
        ) : null}
      </Tabs>
      {roles.data &&
      permissions.data &&
      access.permissionIds.some((permission) =>
        administrationPermissions.includes(permission),
      ) ? (
        <AccessAdministration
          access={access}
          members={members.data?.items ?? []}
          permissions={permissions.data.items}
          roles={roles.data.items}
          onAssignRole={async (userId, roleId) => {
            const result = await assignRole({ userId, input: { roleId } });
            if ('error' in result) {
              return { success: false };
            }
            alertAccessSuccess('assignRole');
            return { success: true };
          }}
          onDeleteRole={async (roleId, replacementRoleId) => {
            const result = await deleteRole({
              roleId,
              input: { replacementRoleId },
            });
            if ('error' in result) {
              return { success: false };
            }
            alertAccessSuccess('deleteRole');
            return { success: true };
          }}
          onSaveRole={async (input, roleId) => {
            if (roleId) {
              const result = await updateRole({ roleId, input });
              if ('error' in result) {
                return {
                  success: false,
                  fieldErrors: isApiFailure(result.error)
                    ? result.error.fieldErrors
                    : undefined,
                };
              }
              alertAccessSuccess('updateRole');
              return { success: true };
            }
            const result = await createRole(input);
            if ('error' in result) {
              return {
                success: false,
                fieldErrors: isApiFailure(result.error)
                  ? result.error.fieldErrors
                  : undefined,
              };
            }
            alertAccessSuccess('createRole');
            return { success: true };
          }}
          onTransferManager={async (recipientUserId, formerManagerRoleId) => {
            const result = await transferManager({
              recipientUserId,
              formerManagerRoleId,
            });
            if ('error' in result) {
              return { success: false };
            }
            alertAccessSuccess('transferManager');
            return { success: true };
          }}
        />
      ) : null}
    </main>
  );
};
