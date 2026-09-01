import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CustomerOrderRefusalAlert } from 'modules/customer-order/components/demand-directory/components/CustomerOrderRefusalAlert';
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

/** Which `validation` section explains each field (BRIEF §A). */
const VALIDATION_SECTION: Record<keyof CancelCustomerOrderForm, string> = {
  cancellationReason: 'customerOrderCancellationReason',
};

/**
 * Cancels a Customer Order, removing it from the consolidated demand
 * (AC-19a). The reason is never optional, so this is a `FormModalDialog`
 * rather than a plain confirmation (`docs/system/guides/web-dialogs.md`):
 * there is one field, and it is always validated.
 *
 * The reason field carries every refusal the server can name here: an empty or
 * whitespace-only reason arrives as `tooSmall` (a Zod issue the server lifted
 * into `details.fields`) or as `customer_orders.invalid_input` naming the field
 * and the rule, and an order that has already left the Unfulfilled state
 * arrives as `customer_orders.invalid_state`, which the endpoint binds to the
 * same field (`api/customer-order-api.ts`). So a refusal marks the value rather
 * than reporting that nothing changed (AC-19a, BRIEF §A).
 *
 * The note below the field states what cancelling does to a frozen draft that
 * links to this order: nothing at all. The draft keeps every value it was
 * frozen with — it is the record of what the supplier was told — and reports a
 * Drift Signal instead (AC-16, AC-19a).
 */
export const CancelCustomerOrderDialog = ({
  order,
  onSave,
}: CancelCustomerOrderDialogProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const { t: translate } = useTranslation('validation');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<CancelCustomerOrderForm>({
    defaultValues: { cancellationReason: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const isFieldExplained = Object.keys(errors).length > 0;

  const translateValidation = (
    code: string,
    field: keyof CancelCustomerOrderForm,
  ): string => translate(`${VALIDATION_SECTION[field]}.${code}`);

  return (
    <FormModalDialog
      title={t('dialogs.cancel.title', { customerName: order.customerName })}
      cancelLabel={t('dialogs.cancel.cancel')}
      submitLabel={t('dialogs.cancel.submit')}
      submitVariant="danger"
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <p className="text-muted">{t('dialogs.cancel.description')}</p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        description={t('dialogs.cancel.reasonHelp')}
        isInvalid={Boolean(errors.cancellationReason)}
        errorMessage={errors.cancellationReason?.message}
        label={t('dialogs.cancel.reasonLabel')}
        isDisabled={isSubmitting}
        {...register('cancellationReason', {
          required: translateValidation('required', 'cancellationReason'),
        })}
      />
      <p className="text-sm text-muted">{t('dialogs.cancel.frozenDrafts')}</p>
      <CustomerOrderRefusalAlert
        code={isFieldExplained ? undefined : refusalCode}
        form="cancel"
      />
    </FormModalDialog>
  );
};
