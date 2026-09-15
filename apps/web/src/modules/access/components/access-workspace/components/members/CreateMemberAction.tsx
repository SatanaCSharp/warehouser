import { Modal } from '@heroui/react';
import type { CreateMemberInput } from '@warehouser/contracts/users';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useCreateMemberMutation } from 'modules/access/api/access-api';
import { CreateActionButton } from 'modules/access/components/access-workspace/components/CreateActionButton';
import { CreateMemberDialog } from 'modules/access/components/access-workspace/components/members/CreateMemberDialog';
import { useAccessScope } from 'modules/access/hooks/projections/useAccessScope';
import { useAccessRoles } from 'modules/access/hooks/queries/useAccessRoles';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { Conditional } from 'shared/components/Conditional';
import { TriggeredDialog } from 'shared/components/TriggeredDialog';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';

/**
 * The Create Member workflow, whole: its gate, the trigger, the dialog it opens,
 * and the mutation it runs. An actor without `USERS:CREATE` gets no trigger at
 * all (AC-03), and the dialog closes itself once the member exists.
 */
export const CreateMemberAction = (): ReactElement => {
  const { t } = useTranslation('access');
  const { isArchived, warehouseId } = useAccessScope();
  const roles = useAccessRoles();
  const [createMember] = useCreateMemberMutation();

  const onSave = (input: CreateMemberInput): Promise<MutationResult> =>
    createMember({ warehouseId: warehouseId ?? '', input });

  return (
    <WarehousePermissionGate permission={PermissionId.USERS_CREATE}>
      <Modal>
        <CreateActionButton
          isDisabled={isArchived}
          label={t('administration.createMember.open')}
          reason={t('archived.reason')}
        />
        <TriggeredDialog>
          <Conditional when={!isArchived}>
            <CreateMemberDialog roles={roles.items} onSave={onSave} />
          </Conditional>
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
