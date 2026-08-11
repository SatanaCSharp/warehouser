import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CreateActionButton } from 'modules/access/components/access-workspace/components/CreateActionButton';
import { CreateRoleDialog } from 'modules/access/components/access-workspace/components/roles/CreateRoleDialog';
import { useAccessCapabilities } from 'modules/access/hooks/useAccessCapabilities';
import { useAccessPermissions } from 'modules/access/hooks/useAccessPermissions';
import { useSaveRole } from 'modules/access/hooks/useSaveRole';

import type { ReactElement } from 'react';

/**
 * The Create Role workflow, whole: the trigger, the dialog it opens, and the
 * mutation it runs. The dialog stays open on failure so the actor can correct
 * the name the server rejected.
 */
export const CreateRoleAction = (): ReactElement | null => {
  const { t } = useTranslation('access');
  const { canCreateRoles } = useAccessCapabilities();
  const permissions = useAccessPermissions();
  const saveRole = useSaveRole();
  const [isOpen, setIsOpen] = useState(false);

  if (!canCreateRoles) {
    return null;
  }

  return (
    <>
      <CreateActionButton
        label={t('administration.createRole')}
        onPress={() => setIsOpen(true)}
      />
      {isOpen ? (
        <CreateRoleDialog
          permissions={permissions.items}
          onClose={() => setIsOpen(false)}
          onSave={async (input) => {
            const outcome = await saveRole(input);
            if (outcome.success) {
              setIsOpen(false);
            }
            return outcome;
          }}
        />
      ) : null}
    </>
  );
};
