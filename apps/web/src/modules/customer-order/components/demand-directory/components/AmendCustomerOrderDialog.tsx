import { Alert } from '@heroui/react';
import type {
  CustomerOrder,
  CustomerOrderAmend,
} from '@warehouser/contracts/customer-orders';
import { CustomerOrderRefusalAlert } from 'modules/customer-order/components/demand-directory/components/CustomerOrderRefusalAlert';
import { useCustomerOrderNaming } from 'modules/customer-order/hooks/projections/useCustomerOrderNaming';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { FormDateField } from 'shared/components/FormDateField';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import type { FormParseResult } from 'shared/utils/form-parse';

type AmendCustomerOrderDialogProps = {
  order: CustomerOrder;
  onSave: (input: CustomerOrderAmend) => Promise<MutationResult>;
};

type AmendCustomerOrderForm = { quantity: number; neededBy: string };

/**
 * AC-19b's refusal is only fully explicable with the figure it was measured
 * against — the quantity already assigned to this customer from an arrival. The
 * server publishes it as the refusal's `details.allocatedQuantity`, so the
 * message that names it is a *different* key from the one that can only state
 * the rule. Which of the two applies is data, not control flow
 * (writing-web-components.md §6).
 */
const BELOW_ALLOCATED = 'belowAllocated';

/** Which `validation` section explains each field (BRIEF §A). */
const VALIDATION_SECTION: Record<keyof AmendCustomerOrderForm, string> = {
  quantity: 'customerOrderQuantity',
  neededBy: 'customerOrderNeededBy',
};

/**
 * Amends one Customer Order's quantity or needed-by date (AC-19), and names the
 * value it will not accept when the server refuses one (AC-19b, AC-02a).
 *
 * Only the values that actually changed are submitted, because the request
 * schema is `minProperties: 1` with both properties optional and the
 * Outstanding Quantity is recalculated rather than sent.
 *
 * Two refusals reach a field here, and neither is a Zod issue: AC-19b's
 * "cannot go below what is already assigned" and AC-02a's "that date has
 * passed" are `ApplicationError`s decided against server state and the server's
 * clock, so the endpoint binds them to `quantity` and `neededBy` with
 * `fieldErrorsForCode` (`api/customer-order-api.ts`). Submitting no change at
 * all is refused by the schema's cross-field `refine`, which carries an empty
 * issue path and therefore names no field — that one is explained by
 * `CustomerOrderRefusalAlert` instead (BRIEF §A).
 *
 * The warning alert states what an amendment does to a frozen draft that links
 * to this order: nothing. The draft records what the supplier was told and is
 * left exactly as it is; what moves is the Drift Signal comparing it against
 * the demand as it now stands (AC-16, spec.md §1 third boundary).
 */
export const AmendCustomerOrderDialog = ({
  order,
  onSave,
}: AmendCustomerOrderDialogProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const { t: translate } = useTranslation('validation');
  const format = useLocaleFormat();
  const naming = useCustomerOrderNaming();
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<AmendCustomerOrderForm>({
    defaultValues: { quantity: order.quantity, neededBy: order.neededBy },
  });
  const {
    control,
    formState: { errors, isSubmitting },
    register,
  } = form;

  const isFieldExplained = Object.keys(errors).length > 0;

  const translateValidation = (
    code: string,
    field: keyof AmendCustomerOrderForm,
    details?: Record<string, unknown>,
  ): string => {
    const allocated = details?.allocatedQuantity;
    const namesTheFigure =
      code === BELOW_ALLOCATED && typeof allocated === 'number';

    return translate(
      `${VALIDATION_SECTION[field]}.${namesTheFigure ? `${code}Known` : code}`,
      namesTheFigure ? { allocated: format.quantity(allocated) } : undefined,
    );
  };

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
      title={t('dialogs.amend.title', {
        customerName: naming(order),
      })}
      cancelLabel={t('dialogs.amend.cancel')}
      submitLabel={t('dialogs.amend.submit')}
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <p className="text-muted">{t('dialogs.amend.description')}</p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        type="number"
        description={t('dialogs.amend.quantityHelp')}
        isInvalid={Boolean(errors.quantity)}
        errorMessage={errors.quantity?.message}
        defaultValue={String(order.quantity)}
        label={t('dialogs.amend.quantityLabel')}
        isDisabled={isSubmitting}
        {...register('quantity', {
          required: translateValidation('required', 'quantity'),
          valueAsNumber: true,
        })}
      />
      <Controller
        control={control}
        name="neededBy"
        rules={{ required: translateValidation('required', 'neededBy') }}
        render={({ field }) => (
          <FormDateField
            isRequired
            validationBehavior="aria"
            description={t('dialogs.amend.neededByHelp')}
            isInvalid={Boolean(errors.neededBy)}
            errorMessage={errors.neededBy?.message}
            label={t('dialogs.amend.neededByLabel')}
            isDisabled={isSubmitting}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('dialogs.amend.frozenDrafts.heading')}</Alert.Title>
          <Alert.Description>
            {t('dialogs.amend.frozenDrafts.body')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <CustomerOrderRefusalAlert
        code={isFieldExplained ? undefined : refusalCode}
        form="amend"
      />
    </FormModalDialog>
  );
};
