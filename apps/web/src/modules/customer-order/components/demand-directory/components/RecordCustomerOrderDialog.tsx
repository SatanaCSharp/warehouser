import { Alert } from '@heroui/react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ItemPicker } from 'modules/item/components/ItemPicker';
import { useItems } from 'modules/item/hooks/queries/useItems';
import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { CustomerOrderCreate } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type RecordCustomerOrderDialogProps = {
  /** Pre-selects the Item when opened from a Demand Line's own action. */
  presetItemId?: string;
  onSave: (input: CustomerOrderCreate) => Promise<MutationResult>;
};

type RecordCustomerOrderForm = {
  itemId: string;
  customerName: string;
  quantity: number;
  neededBy: string;
};

/**
 * Records a named customer's demand as Unfulfilled (AC-01). Quantity,
 * customer name and needed-by are validated server-side (AC-02, AC-02a); the
 * fields here are only ever required, which react-hook-form's own `rules`
 * already enforce, so no client-side duplicate of those rules is written.
 * Reaches the Item picker through `modules/item`'s declared public surface
 * rather than promoting it to `shared/`.
 */
export const RecordCustomerOrderDialog = ({
  presetItemId,
  onSave,
}: RecordCustomerOrderDialogProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const items = useItems();
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<RecordCustomerOrderForm>({
    defaultValues: {
      itemId: presetItemId ?? '',
      customerName: '',
      quantity: 1,
      neededBy: '',
    },
  });
  const {
    control,
    formState: { errors, isSubmitting },
    register,
  } = form;

  const onSubmit = (values: RecordCustomerOrderForm): Promise<MutationResult> =>
    onSave({
      itemId: values.itemId,
      customerName: values.customerName,
      quantity: values.quantity,
      neededBy: values.neededBy,
    });

  return (
    <FormModalDialog
      title={t('dialogs.record.title')}
      cancelLabel={t('dialogs.record.cancel')}
      submitLabel={t('dialogs.record.submit')}
      form={form}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
      <Controller
        control={control}
        name="itemId"
        rules={{ required: true }}
        render={({ field }) => (
          <ItemPicker
            isDisabled={isSubmitting}
            isInvalid={Boolean(errors.itemId)}
            items={items}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.customerName)}
        errorMessage={errors.customerName?.message}
        label={t('dialogs.record.customerNameLabel')}
        isDisabled={isSubmitting}
        {...register('customerName', { required: true })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        type="number"
        isInvalid={Boolean(errors.quantity)}
        errorMessage={errors.quantity?.message}
        label={t('dialogs.record.quantityLabel')}
        isDisabled={isSubmitting}
        {...register('quantity', { required: true, valueAsNumber: true })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        type="date"
        isInvalid={Boolean(errors.neededBy)}
        errorMessage={errors.neededBy?.message}
        label={t('dialogs.record.neededByLabel')}
        isDisabled={isSubmitting}
        {...register('neededBy', { required: true })}
      />
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t('dialogs.record.refusal')}</Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </FormModalDialog>
  );
};
