import { Modal } from '@heroui/react';
import type { RoleWrite } from '@warehouser/contracts/access';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useCreateAccessRoleMutation } from 'modules/access/api/access-api';
import { CreateActionButton } from 'modules/access/components/access-workspace/components/CreateActionButton';
import { CreateRoleDialog } from 'modules/access/components/access-workspace/components/roles/CreateRoleDialog';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { useAccessPermissions } from 'modules/access/hooks/queries/useAccessPermissions';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { Conditional } from 'shared/components/Conditional';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';

/**
 * The Create Role workflow, whole: its gate, the trigger, the dialog it opens,
 * and the mutation it runs. The dialog stays open on failure so the actor can
 * correct the name the server rejected.
 *
 * An actor without `ROLES:CREATE` is offered no control at all; an archived
 * Warehouse disables the one they do get, with the reason attached (AC-12).
 * Those are two different rules, so they stay two gates rather than one boolean.
 */
export const CreateRoleAction = (): ReactElement => {
  const { t } = useTranslation('access');
  const { isArchived, warehouseId } = useAccessScope();
  const permissions = useAccessPermissions();
  const [createRole] = useCreateAccessRoleMutation();

  const onSave = (input: RoleWrite): Promise<MutationResult> =>
    createRole({ warehouseId: warehouseId ?? '', input });

  return (
    <WarehousePermissionGate permission={PermissionId.ROLES_CREATE}>
      <Modal>
        <CreateActionButton
          isDisabled={isArchived}
          label={t('administration.createRole')}
          reason={t('archived.reason')}
        />
        <TriggeredDialog>
          <Conditional when={!isArchived}>
            <CreateRoleDialog permissions={permissions.items} onSave={onSave} />
          </Conditional>
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
