import { Button, Modal } from '@heroui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { AccessRole } from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type DeletionDialogProps = {
  role: AccessRole;
  roles: AccessRole[];
  onClose: () => void;
  onDelete: (replacementRoleId: string | null) => Promise<void>;
};

type DeletionForm = { replacement: string };

export const DeletionDialog = ({
  role,
  roles,
  onClose,
  onDelete,
}: DeletionDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const assigned = role.assignedMemberCount > 0;
  const { handleSubmit, register } = useForm<DeletionForm>({
    defaultValues: { replacement: '' },
  });

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
    >
      <Modal.Container>
        <Modal.Dialog>
          <form
            onSubmit={handleSubmit(({ replacement }) =>
              onDelete(assigned ? replacement : null),
            )}
          >
            <Modal.Header>
              <Modal.Heading>
                {t('administration.deletion.title', { role: role.name })}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {assigned ? (
                <label>
                  {t('administration.deletion.replacement')}
                  <select
                    required
                    {...register('replacement', { required: assigned })}
                    className="mt-2 w-full rounded-lg border border-border p-3"
                  >
                    <option value="">{t('administration.select')}</option>
                    {roles
                      .filter((candidate) => candidate.id !== role.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <p>{t('administration.deletion.unassigned')}</p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={onClose}>
                {t('administration.cancel')}
              </Button>
              <Button variant="danger" type="submit">
                {assigned
                  ? t('administration.deletion.replaceAndDelete')
                  : t('administration.deletion.confirm')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
