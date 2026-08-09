import { Button, Modal } from '@heroui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { AccessRole } from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type AssignmentDialogProps = {
  memberId: string;
  roles: AccessRole[];
  onClose: () => void;
  onSave: (roleId: string) => Promise<void>;
};

type AssignmentForm = { roleId: string };

export const AssignmentDialog = ({
  memberId,
  roles,
  onClose,
  onSave,
}: AssignmentDialogProps): ReactElement => {
  const { t } = useTranslation('access');
  const { handleSubmit, register } = useForm<AssignmentForm>({
    defaultValues: { roleId: '' },
  });

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
    >
      <Modal.Container>
        <Modal.Dialog>
          <form onSubmit={handleSubmit(({ roleId }) => onSave(roleId))}>
            <Modal.Header>
              <Modal.Heading>
                {t('administration.assignment.title')}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <label>
                {t('administration.assignment.role')}
                <select
                  required
                  {...register('roleId', { required: true })}
                  className="mt-2 w-full rounded-lg border border-border p-3"
                >
                  <option value="">{t('administration.select')}</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="font-mono text-sm">{memberId}</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={onClose}>
                {t('administration.cancel')}
              </Button>
              <Button variant="primary" type="submit">
                {t('administration.assignment.save')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
};
