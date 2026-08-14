import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useCreateWarehouse } from 'modules/warehouse/hooks/useCreateWarehouse';
import { warehouseNameFormSchema } from 'modules/warehouse/schemas/warehouse-name-form.schema';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';
import { useFormFieldErrors } from 'shared/hooks/useFormFieldErrors';

import type { WarehouseNameFormValues } from 'modules/warehouse/schemas/warehouse-name-form.schema';
import type { ReactElement } from 'react';

type AddWarehouseDialogProps = {
  onClose: () => void;
};

/**
 * Adds a Warehouse to the Workspace (AC-06, AC-08). Owned exclusively by
 * `AddWarehouseAction`, which is the only trigger for it.
 */
export const AddWarehouseDialog = ({
  onClose,
}: AddWarehouseDialogProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const { t: translateValidation } = useTranslation('validation');
  const createWarehouse = useCreateWarehouse();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<WarehouseNameFormValues>({ defaultValues: { name: '' } });
  const { setFieldError } =
    useFormFieldErrors<WarehouseNameFormValues>(setError);

  const submit = async ({ name }: WarehouseNameFormValues): Promise<void> => {
    const parsedName = warehouseNameFormSchema.safeParse({ name });
    if (!parsedName.success) {
      setFieldError(
        'name',
        parsedName.error.issues[0]?.message,
        translateValidation,
      );
      return;
    }

    const result = await createWarehouse(parsedName.data);
    if (result.success) {
      onClose();
      return;
    }
    setFieldError('name', result.fieldErrors?.name, translateValidation);
  };

  return (
    <FormModalDialog
      title={t('warehouses.add.title')}
      cancelLabel={t('warehouses.add.cancel')}
      submitLabel={t('warehouses.add.submit')}
      noValidate
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
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
