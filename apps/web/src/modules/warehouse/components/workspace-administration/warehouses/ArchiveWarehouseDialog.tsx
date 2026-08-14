import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSetWarehouseArchival } from 'modules/warehouse/hooks/useSetWarehouseArchival';
import { FormModalDialog } from 'shared/components/FormModalDialog';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { FormEventHandler, ReactElement } from 'react';

type ArchiveWarehouseDialogProps = {
  warehouse: Warehouse;
  onClose: () => void;
};

/**
 * Withdraws a Warehouse from operation (AC-11): names what stops, what is
 * kept, and what the boundary refuses, before committing. Owned exclusively
 * by the Warehouse detail pane's "Archive warehouse" action.
 */
export const ArchiveWarehouseDialog = ({
  warehouse,
  onClose,
}: ArchiveWarehouseDialogProps): ReactElement => {
  const { t } = useTranslation('workspace');
  const setWarehouseArchival = useSetWarehouseArchival();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    void setWarehouseArchival(warehouse.id, true).then((result) => {
      setIsSubmitting(false);
      if (result.success) {
        onClose();
      }
    });
  };

  return (
    <FormModalDialog
      title={t('warehouses.archive.title', { name: warehouse.name })}
      cancelLabel={t('warehouses.archive.cancel')}
      submitLabel={t('warehouses.archive.submit')}
      submitVariant="danger"
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={submit}
    >
      <p className="text-muted">{t('warehouses.archive.description')}</p>
      <div>
        <h3 className="font-semibold">{t('warehouses.archive.stopsTitle')}</h3>
        <p className="text-sm text-muted">
          {t('warehouses.archive.stopsDescription', { name: warehouse.name })}
        </p>
      </div>
      <div>
        <h3 className="font-semibold">{t('warehouses.archive.keptTitle')}</h3>
        <p className="text-sm text-muted">
          {t('warehouses.archive.keptDescription')}
        </p>
      </div>
    </FormModalDialog>
  );
};
