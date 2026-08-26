import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type {
  CustomerOrder,
  CustomerOrderCancellation,
} from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type CancelCustomerOrderDialogProps = {
  order: CustomerOrder;
  onSave: (input: CustomerOrderCancellation) => Promise<MutationResult>;
};

type CancelCustomerOrderForm = { cancellationReason: string };

/**
 * Cancels a Customer Order, removing it from the consolidated demand
 * (AC-19a). The reason is never optional, so this is a `FormModalDialog`
 * rather than a plain confirmation (`docs/system/guides/web-dialogs.md`):
 * there is one field, and it is always validated.
 */
export const CancelCustomerOrderDialog = ({
  order,
  onSave,
}: CancelCustomerOrderDialogProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<CancelCustomerOrderForm>({
    defaultValues: { cancellationReason: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  return (
    <FormModalDialog
      title={t('dialogs.cancel.title', { customerName: order.customerName })}
      cancelLabel={t('dialogs.cancel.cancel')}
      submitLabel={t('dialogs.cancel.submit')}
      submitVariant="danger"
      form={form}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <p>{t('dialogs.cancel.body')}</p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.cancellationReason)}
        errorMessage={errors.cancellationReason?.message}
        label={t('dialogs.cancel.reasonLabel')}
        isDisabled={isSubmitting}
        {...register('cancellationReason', {
          required: t('dialogs.cancel.reasonRequired'),
        })}
      />
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t('dialogs.cancel.refusal')}</Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </FormModalDialog>
  );
};
