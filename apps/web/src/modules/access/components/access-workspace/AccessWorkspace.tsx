import { Card, CardBody, CardHeader, Skeleton, Tab, Tabs } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

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

import type { AccessProjection } from '@warehouser/contracts/access';
import type { ReactElement } from 'react';

type AccessWorkspaceProps = { access: AccessProjection };

const LoadingList = (): ReactElement => (
  <div aria-label="Loading access data" className="space-y-3">
    <Skeleton className="h-16 rounded-medium" />
    <Skeleton className="h-16 rounded-medium" />
  </div>
);

export const AccessWorkspace = ({
  access,
}: AccessWorkspaceProps): ReactElement => {
  const { t } = useTranslation('access');
  const canReadRoles = access.permissionIds.includes(PermissionId.ROLES_WATCH);
  const canReadMembers = access.permissionIds.includes(
    PermissionId.USERS_WATCH,
  );
  const roles = useListAccessRolesQuery(undefined, { skip: !canReadRoles });
  const permissions = useListAccessPermissionsQuery(undefined, {
    skip: !canReadRoles,
  });
  const members = useListAccessMembersQuery(undefined, {
    skip: !canReadMembers,
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
        [
          PermissionId.ROLES_ASSIGN,
          PermissionId.ROLES_CREATE,
          PermissionId.ROLES_DELETE,
          PermissionId.ROLES_UPDATE,
          PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
        ].includes(permission),
      ) ? (
        <AccessAdministration
          access={access}
          members={members.data?.items ?? []}
          permissions={permissions.data.items}
          roles={roles.data.items}
          onAssignRole={async (userId, roleId) => {
            await assignRole({ userId, input: { roleId } }).unwrap();
          }}
          onDeleteRole={async (roleId, replacementRoleId) => {
            await deleteRole({ roleId, input: { replacementRoleId } }).unwrap();
          }}
          onSaveRole={async (input, roleId) => {
            if (roleId) {
              await updateRole({ roleId, input }).unwrap();
              return;
            }
            await createRole(input).unwrap();
          }}
          onTransferManager={async (recipientUserId, formerManagerRoleId) => {
            await transferManager({
              recipientUserId,
              formerManagerRoleId,
            }).unwrap();
          }}
        />
      ) : null}
    </main>
  );
};
