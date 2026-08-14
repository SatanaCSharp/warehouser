import { Button } from '@heroui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useRenameWarehouse } from 'modules/workspace/hooks/useRenameWarehouse';
import { warehouseNameFormSchema } from 'modules/workspace/schemas/warehouse-name-form.schema';
import { FormTextField } from 'shared/components/FormTextField';
import { useFormFieldErrors } from 'shared/hooks/useFormFieldErrors';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { WarehouseNameFormValues } from 'modules/workspace/schemas/warehouse-name-form.schema';
import type { ReactElement } from 'react';

type WarehouseNameFormProps = {
  canRenameWarehouse: boolean;
  warehouse: Warehouse;
};

/**
 * Renames a Warehouse of the Workspace (AC-09). Stays available even while
 * the Warehouse is archived, because its subject is the Warehouse record
 * itself (AC-11). An actor without the rename Permission is offered no
 * editable name at all (AC-30). `canRenameWarehouse` is read from the single
 * Workspace context read `WarehousesTab` owns (see `AddWarehouseAction`).
 */
export const WarehouseNameForm = ({
  canRenameWarehouse,
  warehouse,
}: WarehouseNameFormProps): ReactElement | null => {
  const { t } = useTranslation('workspace');
  const { t: translateValidation } = useTranslation('validation');
  const renameWarehouse = useRenameWarehouse();
  const {
    formState: { errors, isDirty, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<WarehouseNameFormValues>({
    defaultValues: { name: warehouse.name },
  });
  const { setFieldError } =
    useFormFieldErrors<WarehouseNameFormValues>(setError);

  if (!canRenameWarehouse) {
    return null;
  }

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

    const result = await renameWarehouse(warehouse.id, parsedName.data);
    if (!result.success) {
      setFieldError('name', result.fieldErrors?.name, translateValidation);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={handleSubmit(submit)}
    >
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name?.message}
        defaultValue={warehouse.name}
        label={t('warehouses.detail.nameLabel')}
        description={t('warehouses.detail.nameDescription')}
        isDisabled={isSubmitting}
        {...register('name')}
      />
      <div>
        <Button
          type="submit"
          variant="primary"
          isDisabled={!isDirty || isSubmitting}
          isPending={isSubmitting}
        >
          {t('warehouses.detail.saveName')}
        </Button>
      </div>
    </form>
  );
};
