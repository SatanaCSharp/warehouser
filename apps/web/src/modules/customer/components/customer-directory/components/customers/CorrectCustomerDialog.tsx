import type { Customer, CustomerUpdate } from '@warehouser/contracts/customers';
import { CustomerRefusalAlert } from 'modules/customer/components/customer-directory/components/CustomerRefusalAlert';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

type CorrectCustomerForm = { name: string };

export type CorrectCustomerDialogProps = {
  customer: Customer;
  onSave: (input: CustomerUpdate) => Promise<MutationResult>;
};

/**
 * Corrects a Customer's name (`ee6Ez` "Correct a customer's name", AC-03b).
 *
 * The name is the only correctable value: activation is its own sub-resource
 * and the Delivery Addresses are their own collection, so neither is amendable
 * here (`customerUpdateSchema`). The dialog states the promise AC-03b makes —
 * every Customer Order and every frozen line that named the Customer keeps
 * naming the same Customer — because a member correcting a name of record
 * needs to know nothing else moved.
 *
 * AC-03c is refused on the name field: a name identifies at most one Customer
 * within a Warehouse, active or Inactive alike.
 */
export const CorrectCustomerDialog = ({
  customer,
  onSave,
}: CorrectCustomerDialogProps): ReactElement => {
  const { t } = useTranslation('customer');
  const { t: translate } = useTranslation('validation');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<CorrectCustomerForm>({
    defaultValues: { name: customer.name },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  // The form has one field, so the code alone decides the key; the field
  // argument `FormModalDialog` also passes is not read.
  const translateValidation = (code: string): string =>
    translate(`customerName.${code}`, { name: form.getValues('name') });

  return (
    <FormModalDialog<CorrectCustomerForm, CustomerUpdate>
      title={t('dialogs.correct.title', { name: customer.name })}
      cancelLabel={t('dialogs.correct.cancel')}
      submitLabel={t('dialogs.correct.submit')}
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <p className="text-muted">{t('dialogs.correct.lede')}</p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name?.message}
        defaultValue={customer.name}
        label={t('dialogs.correct.nameLabel')}
        isDisabled={isSubmitting}
        {...register('name', { required: translate('customerName.required') })}
      />
      <p className="text-sm text-muted">{t('dialogs.correct.note')}</p>
      <CustomerRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
