import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { CreateRoleAction } from 'modules/access/components/access-workspace/components/roles/CreateRoleAction';
import { MemberAssignmentList } from 'modules/access/components/access-workspace/components/roles/MemberAssignmentList';
import { RoleDirectory } from 'modules/access/components/access-workspace/components/roles/RoleDirectory';
import { RolesDatasetCard } from 'modules/access/components/access-workspace/components/roles/RolesDatasetCard';
import { TransferManagerAction } from 'modules/access/components/access-workspace/components/roles/TransferManagerAction';
import { useAccessPermissions } from 'modules/access/hooks/queries/useAccessPermissions';
import { useAccessRoles } from 'modules/access/hooks/queries/useAccessRoles';
import { useHasPermission } from 'shared/hooks/queries/usePermissions';

import type { ReactElement } from 'react';

/** Any Role administration at all; each control below still gates on its own. */
const roleAdministrationPermissions = [
  PermissionId.ROLES_ASSIGN,
  PermissionId.ROLES_CREATE,
  PermissionId.ROLES_DELETE,
  PermissionId.ROLES_UPDATE,
  PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
];

/**
 * Roles tab body. An actor who may administer Roles gets the editable surface
 * once the datasets it edits have arrived; everyone else — and everyone still
 * waiting on those datasets — gets the read-only card.
 *
 * The read-only card is an *alternative surface*, not a withheld control, so this
 * tab reads the Permission itself and returns one of two whole-component states.
 * A gate renders its children or nothing; it does not choose between two
 * surfaces (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * The Permission catalogue is read here only to time that choice: the editable
 * surface must not appear before the grants it edits exist, or the editor's
 * Permission rows arrive a heartbeat after the Role list. Each component that
 * grants from the catalogue — `CreateRoleAction`, `RoleEditor` — reads it
 * where it uses it, so nothing is threaded down on the way there.
 */
export const RolesTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const canAdministerRoles = useHasPermission(roleAdministrationPermissions);
  const permissions = useAccessPermissions();
  const roles = useAccessRoles();

  if (!canAdministerRoles || !roles.isReady || !permissions.isReady) {
    return <RolesDatasetCard dataset={roles} />;
  }

  return (
    <section aria-label={t('roles.heading')}>
      <div className="mb-5 flex flex-wrap justify-end gap-2">
        <CreateRoleAction />
        <TransferManagerAction />
      </div>
      <RoleDirectory roles={roles.items} />
      <MemberAssignmentList />
    </section>
  );
};
