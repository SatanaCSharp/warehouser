import { Button } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AssignRoleDialog } from 'modules/access/components/access-workspace/components/roles/AssignRoleDialog';
import { useAccessCapabilities } from 'modules/access/hooks/useAccessCapabilities';
import { useAccessMembers } from 'modules/access/hooks/useAccessMembers';
import { useAccessRoles } from 'modules/access/hooks/useAccessRoles';
import { useAssignMemberRole } from 'modules/access/hooks/useAssignMemberRole';

import type { ReactElement } from 'react';

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

  if (!canAssignRoles) {
    return null;
  }

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
              <span className="font-mono text-sm">{member.userId}</span>
              <Button
                size="sm"
                variant="outline"
                onPress={() => setSelectedMemberId(member.userId)}
              >
                {t('administration.assignment.open', {
                  userId: member.userId,
                })}
              </Button>
            </div>
          ))}
      </div>

      {selectedMemberId ? (
        <AssignRoleDialog
          memberId={selectedMemberId}
          roles={roles.items.filter((role) => role.kind === 'custom')}
          onClose={() => setSelectedMemberId(null)}
          onSave={async (roleId) => {
            const outcome = await assignMemberRole(selectedMemberId, roleId);
            if (outcome.success) {
              setSelectedMemberId(null);
            }
          }}
        />
      ) : null}
    </>
  );
};
