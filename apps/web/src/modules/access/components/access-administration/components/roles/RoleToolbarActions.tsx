import { Button } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { CreateActionButton } from 'modules/access/components/access-administration/components/CreateActionButton';
import { PermissionGate } from 'shared/components/PermissionGate';

import type { OpenAccessWorkflow } from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type RoleToolbarActionsProps = {
  permissionIds: readonly string[];
  onOpenWorkflow: OpenAccessWorkflow;
};

export const RoleToolbarActions = ({
  permissionIds,
  onOpenWorkflow,
}: RoleToolbarActionsProps): ReactElement => {
  const { t } = useTranslation('access');

  return (
    <>
      <PermissionGate
        permission={PermissionId.ROLES_CREATE}
        permissionIds={permissionIds}
      >
        <CreateActionButton
          label={t('administration.createRole')}
          onPress={() => onOpenWorkflow({ kind: 'role' })}
        />
      </PermissionGate>
      <PermissionGate
        permission={PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN}
        permissionIds={permissionIds}
      >
        <Button
          variant="outline"
          onPress={() => onOpenWorkflow({ kind: 'transfer' })}
        >
          {t('administration.transfer.open')}
        </Button>
      </PermissionGate>
    </>
  );
};
