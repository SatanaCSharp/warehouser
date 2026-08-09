import { Tabs } from '@heroui/react';
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
} from 'modules/access/components/access-workspace/components/AccessDatasetCards';
import { useAccessAdministrationActions } from 'modules/access/hooks/useAccessAdministrationActions';
import { hasPermission } from 'shared/hooks/usePermissions';

import type {
  AccessProjection,
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';
import type { TFunction } from 'i18next';
import type { ReactElement } from 'react';

type AccessWorkspaceProps = { access: AccessProjection };

const roleAdministrationPermissions: readonly PermissionId[] = [
  PermissionId.ROLES_ASSIGN,
  PermissionId.ROLES_CREATE,
  PermissionId.ROLES_DELETE,
  PermissionId.ROLES_UPDATE,
  PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
];

const memberAdministrationPermissions: readonly PermissionId[] = [
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
  const canReadRoles = hasPermission(permissionIds, PermissionId.ROLES_WATCH);
  const canManageRoles = hasPermission(
    permissionIds,
    roleAdministrationPermissions,
  );
  const canReadMembers = hasPermission(permissionIds, PermissionId.USERS_WATCH);
  const canCreateMembers = hasPermission(
    permissionIds,
    PermissionId.USERS_CREATE,
  );
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
    canAssignRoles: hasPermission(permissionIds, [
      PermissionId.ROLES_ASSIGN,
      PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
    ]),
    canManageMemberLifecycle: hasPermission(
      permissionIds,
      memberAdministrationPermissions,
    ),
    canLoadPermissions: hasPermission(permissionIds, [
      PermissionId.ROLES_WATCH,
      PermissionId.ROLES_CREATE,
      PermissionId.ROLES_UPDATE,
    ]),
  };
};

type RolesQuery = {
  data?: RolePage;
  isError: boolean;
  isLoading: boolean;
};

type PermissionsQuery = {
  data?: PermissionPage;
  isError: boolean;
  isLoading: boolean;
};

type MembersQuery = {
  data?: MemberPage;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
};

type AdministrationActions = ReturnType<typeof useAccessAdministrationActions>;

const resolveRolesAdministration = ({
  access,
  administrationActions,
  canManageRoles,
  members,
  permissions,
  roles,
}: {
  access: AccessProjection;
  administrationActions: AdministrationActions;
  canManageRoles: boolean;
  members: MembersQuery;
  permissions: PermissionsQuery;
  roles: RolesQuery;
}): ReactElement | null =>
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

const resolveMembersAdministration = ({
  access,
  administrationActions,
  canReadMembers,
  members,
  permissions,
  roles,
}: {
  access: AccessProjection;
  administrationActions: AdministrationActions;
  canReadMembers: boolean;
  members: MembersQuery;
  permissions: PermissionsQuery;
  roles: RolesQuery;
}): ReactElement | null =>
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

const AccessWorkspaceTabs = ({
  t,
  canReadMembers,
  canReadRoles,
  canViewRolesTab,
  members,
  membersAdministration,
  permissions,
  roles,
  rolesAdministration,
}: {
  t: TFunction<'access'>;
  canReadMembers: boolean;
  canReadRoles: boolean;
  canViewRolesTab: boolean;
  members: MembersQuery;
  membersAdministration: ReactElement | null;
  permissions: PermissionsQuery;
  roles: RolesQuery;
  rolesAdministration: ReactElement | null;
}): ReactElement => (
  <Tabs className="w-full">
    <Tabs.ListContainer>
      <Tabs.List
        aria-label={t('navigation.label')}
        className="gap-8 border-b border-border px-0"
      >
        {canViewRolesTab ? (
          <Tabs.Tab id="roles">
            {t('navigation.roles')}
            <Tabs.Indicator />
          </Tabs.Tab>
        ) : null}
        {canReadMembers ? (
          <Tabs.Tab id="members">
            {t('navigation.members')}
            <Tabs.Indicator />
          </Tabs.Tab>
        ) : null}
        {canReadRoles ? (
          <Tabs.Tab id="permissions">
            {t('navigation.permissions')}
            <Tabs.Indicator />
          </Tabs.Tab>
        ) : null}
      </Tabs.List>
    </Tabs.ListContainer>
    {canViewRolesTab ? (
      <Tabs.Panel id="roles" className="px-0 pt-5">
        {rolesAdministration ?? <RolesDatasetCard query={roles} />}
      </Tabs.Panel>
    ) : null}
    {canReadMembers ? (
      <Tabs.Panel id="members" className="px-0 pt-5">
        {membersAdministration ?? <MembersDatasetCard query={members} />}
      </Tabs.Panel>
    ) : null}
    {canReadRoles ? (
      <Tabs.Panel id="permissions" className="px-0 pt-5">
        <PermissionsDatasetCard query={permissions} />
      </Tabs.Panel>
    ) : null}
  </Tabs>
);

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

  const rolesAdministration = resolveRolesAdministration({
    access,
    administrationActions,
    canManageRoles,
    members,
    permissions,
    roles,
  });
  const membersAdministration = resolveMembersAdministration({
    access,
    administrationActions,
    canReadMembers,
    members,
    permissions,
    roles,
  });

  return (
    <main className="w-full bg-surface-secondary/50 px-4 py-7 sm:px-8 lg:px-12 lg:py-9">
      <header className="mx-auto mb-5 max-w-[1440px]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('heading')}
        </h1>
        <p className="mt-2 text-muted">{t('description')}</p>
      </header>
      <div className="mx-auto max-w-[1440px]">
        <AccessWorkspaceTabs
          t={t}
          canReadMembers={canReadMembers}
          canReadRoles={canReadRoles}
          canViewRolesTab={canViewRolesTab}
          members={members}
          membersAdministration={membersAdministration}
          permissions={permissions}
          roles={roles}
          rolesAdministration={rolesAdministration}
        />
      </div>
    </main>
  );
};
