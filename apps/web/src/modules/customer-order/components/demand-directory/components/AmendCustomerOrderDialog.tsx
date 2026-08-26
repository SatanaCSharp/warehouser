import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type {
  CustomerOrder,
  CustomerOrderAmend,
} from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { FormParseResult } from 'shared/utils/form-parse';

type AmendCustomerOrderDialogProps = {
  order: CustomerOrder;
  onSave: (input: CustomerOrderAmend) => Promise<MutationResult>;
};

type AmendCustomerOrderForm = { quantity: number; neededBy: string };

/**
 * Amends a Customer Order's quantity or needed-by date independently
 * (AC-19): changing one submits only the field that changed, exactly as
 * `CorrectItemDialog` does for an Item. A quantity reduced below what has
 * already been assigned (AC-19b) is a server refusal this dialog stays open
 * and states rather than a client-side duplicate of that rule.
 */
export const AmendCustomerOrderDialog = ({
  order,
  onSave,
}: AmendCustomerOrderDialogProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<AmendCustomerOrderForm>({
    defaultValues: { quantity: order.quantity, neededBy: order.neededBy },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const parse = (
    values: AmendCustomerOrderForm,
  ): FormParseResult<AmendCustomerOrderForm, CustomerOrderAmend> => {
    const changes: CustomerOrderAmend = {};
    if (values.quantity !== order.quantity) {
      changes.quantity = values.quantity;
    }
    if (values.neededBy !== order.neededBy) {
      changes.neededBy = values.neededBy;
    }
    return { data: changes, success: true };
  };

  return (
    <FormModalDialog
      title={t('dialogs.amend.title', { customerName: order.customerName })}
      cancelLabel={t('dialogs.amend.cancel')}
      submitLabel={t('dialogs.amend.submit')}
      form={form}
      parse={parse}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        type="number"
        isInvalid={Boolean(errors.quantity)}
        errorMessage={errors.quantity?.message}
        defaultValue={String(order.quantity)}
        label={t('dialogs.amend.quantityLabel')}
        isDisabled={isSubmitting}
        {...register('quantity', { required: true, valueAsNumber: true })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        type="date"
        isInvalid={Boolean(errors.neededBy)}
        errorMessage={errors.neededBy?.message}
        defaultValue={order.neededBy}
        label={t('dialogs.amend.neededByLabel')}
        isDisabled={isSubmitting}
        {...register('neededBy', { required: true })}
      />
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t('dialogs.amend.refusal')}</Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </FormModalDialog>
  );
};
