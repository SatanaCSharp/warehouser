import { Button } from '@heroui/react';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useRenameWarehouseMutation } from 'modules/workspace/api/warehouse-api';
import { warehouseNameFormSchema } from 'modules/workspace/schemas/warehouse-name-form.schema';
import { mutationOutcome } from 'shared/api/client/mutation-outcome';
import { FormTextField } from 'shared/components/FormTextField';
import { WorkspacePermissionGate } from 'shared/components/WorkspacePermissionGate';
import { useFormFieldErrors } from 'shared/hooks/forms/useFormFieldErrors';

import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { WarehouseNameFormValues } from 'modules/workspace/schemas/warehouse-name-form.schema';
import type { ReactElement } from 'react';

type WarehouseNameFormProps = { warehouse: Warehouse };

/**
 * Renames a Warehouse of the Workspace (AC-09). Stays available even while
 * the Warehouse is archived, because its subject is the Warehouse record
 * itself (AC-11). An actor without `WAREHOUSES:RENAME` is offered no editable
 * name at all (AC-30) — the gate reads that itself rather than taking a boolean
 * from `WarehousesTab`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const WarehouseNameForm = ({
  warehouse,
}: WarehouseNameFormProps): ReactElement => {
  const { t } = useTranslation('warehouse');
  const { t: translateValidation } = useTranslation('validation');
  const [renameWarehouse] = useRenameWarehouseMutation();
  const {
    formState: { errors, isDirty, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<WarehouseNameFormValues>({
    defaultValues: { name: warehouse.name },
  });
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

    // Not a `FormModalDialog`: this form stays on the page rather than
    // closing, so it normalizes the settled request itself.
    const outcome = mutationOutcome(
      await renameWarehouse({
        warehouseId: warehouse.id,
        ...parsedName.data,
      }),
    );
    if (!outcome.success) {
      setFieldError('name', outcome.fieldErrors?.name, translateValidation);
    }
  };

  // Cancel abandons the edit rather than the name: the field goes back to the
  // recorded one, and nothing is sent.
  const onPressCancel = (): void => reset({ name: warehouse.name });

  return (
    <WorkspacePermissionGate
      permission={WorkspacePermissionId.WAREHOUSES_RENAME}
    >
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
        {/*
          Cancel precedes the primary in DOM — and therefore keyboard — order,
          as it does in every dialog footer (design-handoff.md §"Component
          mapping").
        */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            isDisabled={!isDirty || isSubmitting}
            onPress={onPressCancel}
          >
            {t('warehouses.detail.cancel')}
          </Button>
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
    </WorkspacePermissionGate>
  );
};
