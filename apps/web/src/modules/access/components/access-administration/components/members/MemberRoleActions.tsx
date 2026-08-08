import { Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { AccessMember } from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type MemberRoleActionsProps = {
  members: AccessMember[];
  onAssign: (memberId: string) => void;
};

export const MemberRoleActions = ({
  members,
  onAssign,
}: MemberRoleActionsProps): ReactElement => {
  const { t } = useTranslation('access');
  const assignableMembers = members.filter(
    (member) => member.roleKind !== 'warehouse_manager',
  );

  return (
    <div className="sr-only mt-6 space-y-2 focus-within:not-sr-only">
      {assignableMembers.map((member) => (
        <div
          className="flex items-center justify-between gap-3 rounded-medium border border-divider p-3"
          key={member.userId}
        >
          <span className="font-mono text-sm">{member.userId}</span>
          <Button
            size="sm"
            variant="bordered"
            onPress={() => onAssign(member.userId)}
          >
            {t('administration.assignment.open', {
              userId: member.userId,
            })}
          </Button>
        </div>
      ))}
    </div>
  );
};
