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

type WorkspacePermissions = {
  canAssignRoles: boolean;
  canLoadPermissions: boolean;
  canLoadRoles: boolean;
  canManageMemberLifecycle: boolean;
  canManageRoles: boolean;
  canReadMembers: boolean;
  canReadRoles: boolean;
  canViewRolesTab: boolean;
};

const deriveWorkspacePermissions = (
  permissionIds: readonly string[],
): WorkspacePermissions => {
  const canReadRoles = permissionIds.includes(PermissionId.ROLES_WATCH);
  const canManageRoles = permissionIds.some((permission) =>
    roleAdministrationPermissions.includes(permission),
  );
  const canReadMembers = permissionIds.includes(PermissionId.USERS_WATCH);
  const canCreateMembers = permissionIds.includes(PermissionId.USERS_CREATE);
  const canViewRolesTab = canReadRoles || canManageRoles;

  return {
    canReadRoles,
    canManageRoles,
    canReadMembers,
    canViewRolesTab,
    // Members (read-only Role-name lookup) and Create Member (Role
    // selection) both need Roles loaded even for an actor who holds no
    // role-admin Permission at all (US-07's exact persona) — this only
    // widens when the Roles *query* fires, not the Roles tab's visibility.
    canLoadRoles: canViewRolesTab || canReadMembers || canCreateMembers,
    canAssignRoles: permissionIds.some(
      (permission) =>
        permission === PermissionId.ROLES_ASSIGN ||
        permission === PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
    ),
    canManageMemberLifecycle: permissionIds.some((permission) =>
      memberAdministrationPermissions.includes(permission),
    ),
    canLoadPermissions: permissionIds.some(
      (permission) =>
        permission === PermissionId.ROLES_WATCH ||
        permission === PermissionId.ROLES_CREATE ||
        permission === PermissionId.ROLES_UPDATE,
    ),
  };
};

export const AccessWorkspace = ({
  access,
}: AccessWorkspaceProps): ReactElement => {
  const { t } = useTranslation('access');
  const {
    canAssignRoles,
    canLoadPermissions,
    canLoadRoles,
    canManageMemberLifecycle,
    canManageRoles,
    canReadMembers,
    canReadRoles,
    canViewRolesTab,
  } = deriveWorkspacePermissions(access.permissionIds);
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
    canReadMembers && members.data ? (
      <AccessAdministration
        access={access}
        isLoading={members.isFetching}
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
          {canViewRolesTab ? (
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
