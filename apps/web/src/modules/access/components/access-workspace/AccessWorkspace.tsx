import { Tab, Tabs } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import {
  useListAccessMembersQuery,
  useListAccessPermissionsQuery,
  useListAccessRolesQuery,
} from 'modules/access/api/access-api';
import { AccessAdministration } from 'modules/access/components/access-administration/AccessAdministration';
import {
  MembersDatasetCard,
  PermissionsDatasetCard,
  RolesDatasetCard,
} from 'modules/access/components/access-workspace/AccessDatasetCards';
import { useAccessAdministrationActions } from 'modules/access/hooks/useAccessAdministrationActions';

import type { AccessProjection } from '@warehouser/contracts/access';
import type { ReactElement } from 'react';

type AccessWorkspaceProps = { access: AccessProjection };

const roleAdministrationPermissions: readonly string[] = [
  PermissionId.ROLES_ASSIGN,
  PermissionId.ROLES_CREATE,
  PermissionId.ROLES_DELETE,
  PermissionId.ROLES_UPDATE,
  PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
];

const memberAdministrationPermissions: readonly string[] = [
  PermissionId.USERS_CREATE,
  PermissionId.USERS_EMAIL_UPDATE,
  PermissionId.USERS_PASSWORD_CHANGE,
  PermissionId.USERS_DELETE,
];

export const AccessWorkspace = ({
  access,
}: AccessWorkspaceProps): ReactElement => {
  const { t } = useTranslation('access');
  const canReadRoles = access.permissionIds.includes(PermissionId.ROLES_WATCH);
  const canManageRoles = access.permissionIds.some((permission) =>
    roleAdministrationPermissions.includes(permission),
  );
  const canLoadRoles = canReadRoles || canManageRoles;
  const canReadMembers = access.permissionIds.includes(
    PermissionId.USERS_WATCH,
  );
  const canAssignRoles = access.permissionIds.some(
    (permission) =>
      permission === PermissionId.ROLES_ASSIGN ||
      permission === PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
  );
  const canManageMemberLifecycle = access.permissionIds.some((permission) =>
    memberAdministrationPermissions.includes(permission),
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
    skip: !(canReadMembers || canAssignRoles || canManageMemberLifecycle),
  });
  const administrationActions = useAccessAdministrationActions();

  const rolesAdministration =
    canManageRoles && roles.data && permissions.data ? (
      <AccessAdministration
        access={access}
        members={members.data?.items ?? []}
        permissions={permissions.data.items}
        roles={roles.data.items}
        view="roles"
        {...administrationActions}
      />
    ) : null;

  const membersAdministration =
    canManageMemberLifecycle && members.data ? (
      <AccessAdministration
        access={access}
        members={members.data.items}
        permissions={permissions.data?.items ?? []}
        roles={roles.data?.items ?? []}
        view="members"
        {...administrationActions}
      />
    ) : null;

  return (
    <main className="w-full bg-content2/50 px-4 py-7 sm:px-8 lg:px-12 lg:py-9">
      <header className="mx-auto mb-5 max-w-[1440px]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('heading')}
        </h1>
        <p className="mt-2 text-foreground-500">{t('description')}</p>
      </header>
      <div className="mx-auto max-w-[1440px]">
        <Tabs
          aria-label={t('navigation.label')}
          color="primary"
          variant="underlined"
          classNames={{
            base: 'w-full',
            tabList: 'gap-8 border-b border-divider px-0',
            cursor: 'w-full',
            panel: 'px-0 pt-5',
          }}
        >
          {canLoadRoles ? (
            <Tab key="roles" title={t('navigation.roles')}>
              {rolesAdministration ?? <RolesDatasetCard query={roles} />}
            </Tab>
          ) : null}
          {canReadMembers ? (
            <Tab key="members" title={t('navigation.members')}>
              {membersAdministration ?? <MembersDatasetCard query={members} />}
            </Tab>
          ) : null}
          {canReadRoles ? (
            <Tab key="permissions" title={t('navigation.permissions')}>
              <PermissionsDatasetCard query={permissions} />
            </Tab>
          ) : null}
        </Tabs>
      </div>
    </main>
  );
};
