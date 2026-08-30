import { Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useAssignAccessMemberRoleMutation } from 'modules/access/api/access-api';
import { AssignRoleDialog } from 'modules/access/components/access-workspace/components/roles/AssignRoleDialog';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { useAccessMembers } from 'modules/access/hooks/queries/useAccessMembers';
import { useAccessRoles } from 'modules/access/hooks/queries/useAccessRoles';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

import type { AccessMember } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/** The one dialog a member row opens. */
type AssignmentDialogKind = 'assignRole';

/**
 * Members are named by the address people recognize. `email` is optional in the
 * projection, so the opaque id stays as the fallback for the one case that has
 * nothing better to show.
 */
const nameOf = (member: { email?: string; userId: string }): string =>
  member.email ?? member.userId;

/**
 * Keyboard-reachable role reassignment for each member, revealed on focus. The
 * protected Warehouse Manager is never listed — that role moves through
 * `TransferManagerAction` instead.
 */
export const MemberAssignmentList = (): ReactElement => {
  const { t } = useTranslation('access');
  const { warehouseId } = useAccessScope();
  const members = useAccessMembers();
  const roles = useAccessRoles();
  const [assignMemberRole] = useAssignAccessMemberRoleMutation();
  const dialog = useActionDialog<AssignmentDialogKind, AccessMember>();

  const onOpenAssignment = (member: AccessMember) => (): void =>
    dialog.open('assignRole', member);

  const onSaveAssignment =
    (userId: string) =>
    (roleId: string): Promise<MutationResult> =>
      assignMemberRole({
        warehouseId: warehouseId ?? '',
        userId,
        input: { roleId },
      });

  return (
    <WarehousePermissionGate permission={PermissionId.ROLES_ASSIGN}>
      {/* The gate renders one child, and the fragment emits no element: the
          list and the dialog it opens stay siblings, as they were. */}
      <>
        <div className="sr-only mt-6 space-y-2 focus-within:not-sr-only">
          {members.items
            .filter((member) => member.roleKind !== 'warehouse_manager')
            .map((member) => (
              <div
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                key={member.userId}
              >
                <span className="text-sm">{nameOf(member)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={onOpenAssignment(member)}
                >
                  {t('administration.assignment.open', {
                    email: nameOf(member),
                  })}
                </Button>
              </div>
            ))}
        </div>

        <ActionDialogHost
          controller={dialog}
          renderDialogs={{
            assignRole: (member) => (
              <AssignRoleDialog
                memberEmail={nameOf(member)}
                roles={roles.items.filter((role) => role.kind === 'custom')}
                onSave={onSaveAssignment(member.userId)}
              />
            ),
          }}
        />
      </>
    </WarehousePermissionGate>
  );
};
