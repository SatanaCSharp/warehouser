import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useCreateWarehouseMutation } from 'modules/workspace/api/warehouse-api';
import { warehouseNameFormSchema } from 'modules/workspace/schemas/warehouse-name-form.schema';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';
import { parseWithSchema } from 'shared/utils/form-parse';

import type { WarehouseNameFormValues } from 'modules/workspace/schemas/warehouse-name-form.schema';
import type { ReactElement } from 'react';

/** AC-08 — the browser pre-check the dialog runs before the request leaves. */
const parse = parseWithSchema(warehouseNameFormSchema);

/**
 * Adds a Warehouse to the Workspace (AC-06, AC-08). Owned exclusively by
 * `AddWarehouseAction`, which is the only trigger for it.
 */
export const AddWarehouseDialog = (): ReactElement => {
  const { t } = useTranslation('warehouse');
  const { t: translateValidation } = useTranslation('validation');
  const [createWarehouse] = useCreateWarehouseMutation();
  const form = useForm<WarehouseNameFormValues>({
    defaultValues: { name: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  return (
    <FormModalDialog
      title={t('warehouses.add.title')}
      cancelLabel={t('warehouses.add.cancel')}
      submitLabel={t('warehouses.add.submit')}
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onSubmit={createWarehouse}
    >
      <p className="text-muted">{t('warehouses.add.description')}</p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name?.message}
        defaultValue=""
        label={t('warehouses.add.nameLabel')}
        description={t('warehouses.add.nameDescription')}
        isDisabled={isSubmitting}
        {...register('name')}
      />
      <div className="rounded-lg border border-border bg-surface-secondary p-3">
        <p className="font-semibold">{t('warehouses.add.noticeTitle')}</p>
        <p className="text-sm text-muted">
          {t('warehouses.add.noticeDescription')}
        </p>
      </div>
    </FormModalDialog>
  );
};
