import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { CreateActionButton } from 'modules/access/components/access-administration/components/CreateActionButton';
import { PermissionGate } from 'shared/components/PermissionGate';

import type { OpenAccessWorkflow } from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type MemberToolbarActionsProps = {
  permissionIds: readonly string[];
  onOpenWorkflow: OpenAccessWorkflow;
};

export const MemberToolbarActions = ({
  permissionIds,
  onOpenWorkflow,
}: MemberToolbarActionsProps): ReactElement => {
  const { t } = useTranslation('access');

  return (
    <PermissionGate
      permission={PermissionId.USERS_CREATE}
      permissionIds={permissionIds}
    >
      <CreateActionButton
        label={t('administration.createMember.open')}
        onPress={() => onOpenWorkflow({ kind: 'create' })}
      />
    </PermissionGate>
  );
};
