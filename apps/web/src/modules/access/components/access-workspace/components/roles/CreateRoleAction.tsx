import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CreateActionButton } from 'modules/access/components/access-workspace/components/CreateActionButton';
import { CreateRoleDialog } from 'modules/access/components/access-workspace/components/roles/CreateRoleDialog';
import { useSaveRole } from 'modules/access/hooks/mutations/useSaveRole';
import { useAccessCapabilities } from 'modules/access/hooks/projections/useAccessCapabilities';
import { useAccessPermissions } from 'modules/access/hooks/queries/useAccessPermissions';
import { Conditional } from 'shared/components/Conditional';

import type { RoleWrite } from '@warehouser/contracts/access';
import type { ReactElement } from 'react';
import type { MutationOutcome } from 'shared/api/client/mutation-outcome';

/**
 * The Create Role workflow, whole: the trigger, the dialog it opens, and the
 * mutation it runs. The dialog stays open on failure so the actor can correct
 * the name the server rejected.
 */
export const CreateRoleAction = (): ReactElement | null => {
  const { t } = useTranslation('access');
  const { canCreateRoles, isArchived, warehouseId } = useAccessCapabilities();
  const permissions = useAccessPermissions();
  const saveRole = useSaveRole(warehouseId ?? '');
  const [isOpen, setIsOpen] = useState(false);

  const onPress = (): void => setIsOpen(true);

  const onClose = (): void => setIsOpen(false);

  const onSave = async (input: RoleWrite): Promise<MutationOutcome> => {
    const outcome = await saveRole(input);
    if (outcome.success) {
      onClose();
    }
    return outcome;
  };

  if (!canCreateRoles) {
    return null;
  }

  return (
    <>
      <CreateActionButton
        isDisabled={isArchived}
        label={t('administration.createRole')}
        reason={t('archived.reason')}
        onPress={onPress}
      />
      <Conditional when={isOpen && !isArchived}>
        <CreateRoleDialog
          permissions={permissions.items}
          onClose={onClose}
          onSave={onSave}
        />
      </Conditional>
    </>
  );
};
