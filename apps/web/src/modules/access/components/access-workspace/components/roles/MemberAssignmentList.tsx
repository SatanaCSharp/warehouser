import { Button } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AssignRoleDialog } from 'modules/access/components/access-workspace/components/roles/AssignRoleDialog';
import { useAssignMemberRole } from 'modules/access/hooks/mutations/useAssignMemberRole';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';
import { useAccessMembers } from 'modules/access/hooks/queries/useAccessMembers';
import { useAccessRoles } from 'modules/access/hooks/queries/useAccessRoles';

import type { ReactElement } from 'react';

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
export const MemberAssignmentList = (): ReactElement | null => {
  const { t } = useTranslation('access');
  const { canAssignRoles, warehouseId } = useAccessCapabilities();
  const members = useAccessMembers();
  const roles = useAccessRoles();
  const assignMemberRole = useAssignMemberRole(warehouseId ?? '');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const onOpenAssignment = (userId: string) => (): void =>
    setSelectedMemberId(userId);

  const onCloseAssignment = (): void => setSelectedMemberId(null);

  const onSaveAssignment =
    (userId: string) =>
    async (roleId: string): Promise<void> => {
      const outcome = await assignMemberRole(userId, roleId);
      if (outcome.success) {
        onCloseAssignment();
      }
    };

  if (!canAssignRoles) {
    return null;
  }

  // The dialog reads the member it was opened for, so it is resolved here
  // rather than gated inline: `Conditional` evaluates both arms, and a member
  // only exists once one is selected.
  const assignRoleDialog =
    selectedMemberId === null ? null : (
      <AssignRoleDialog
        memberEmail={nameOf(
          members.items.find(
            (member) => member.userId === selectedMemberId,
          ) ?? { userId: selectedMemberId },
        )}
        roles={roles.items.filter((role) => role.kind === 'custom')}
        onClose={onCloseAssignment}
        onSave={onSaveAssignment(selectedMemberId)}
      />
    );

  return (
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
                onPress={onOpenAssignment(member.userId)}
              >
                {t('administration.assignment.open', {
                  email: nameOf(member),
                })}
              </Button>
            </div>
          ))}
      </div>

      {assignRoleDialog}
    </>
  );
};
