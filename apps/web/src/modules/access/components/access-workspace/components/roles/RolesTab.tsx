import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { CreateRoleAction } from 'modules/access/components/access-workspace/components/roles/CreateRoleAction';
import { MemberAssignmentList } from 'modules/access/components/access-workspace/components/roles/MemberAssignmentList';
import { RoleDirectory } from 'modules/access/components/access-workspace/components/roles/RoleDirectory';
import { RolesDatasetCard } from 'modules/access/components/access-workspace/components/roles/RolesDatasetCard';
import { TransferManagerAction } from 'modules/access/components/access-workspace/components/roles/TransferManagerAction';
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
 * Roles tab body. An actor who may administer Roles gets the editable surface;
 * everyone else gets the read-only card, and so does anyone — permitted or
 * not — whose Roles read failed.
 *
 * The read-only card is an *alternative surface*, not a withheld control, so this
 * tab reads the Permission itself and returns one of two whole-component states.
 * A gate renders its children or nothing; it does not choose between two
 * surfaces (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * Readiness is not among the questions asked here: the route awaits every
 * dataset this tab paints before the destination mounts (CR-AC-04). What
 * remains is the permission arm and an explicit error arm — the card is the
 * only renderer of `roles.error`, so a permitted actor whose read failed must
 * reach it rather than an empty directory reporting that no Roles exist
 * (CR-AC-15). The catalogue a Role form grants from is read where it is
 * granted — `CreateRoleAction`, `RoleEditor` — and its own failure is reported
 * by the Permissions tab, so it does not withhold the Roles that did arrive.
 */
export const RolesTab = (): ReactElement => {
  const { t } = useTranslation('access');
  const canAdministerRoles = useHasPermission(roleAdministrationPermissions);
  const roles = useAccessRoles();

  if (!canAdministerRoles || roles.isError) {
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
