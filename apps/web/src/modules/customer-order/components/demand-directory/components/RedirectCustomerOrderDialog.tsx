import { Alert } from '@heroui/react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CustomerDeliveryAddressPicker } from 'modules/customer/components/CustomerDeliveryAddressPicker';
import { useCustomers } from 'modules/customer/hooks/queries/useCustomers';
import { CustomerOrderRefusalAlert } from 'modules/customer-order/components/demand-directory/components/CustomerOrderRefusalAlert';
import { useCustomerOrderNaming } from 'modules/customer-order/hooks/projections/useCustomerOrderNaming';
import { customerOrderIdentity } from 'modules/customer-order/utils/customer-order-identity';
import { FormModalDialog } from 'shared/components/FormModalDialog';

import type {
  CustomerOrder,
  CustomerOrderRedirect,
} from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type RedirectCustomerOrderDialogProps = {
  order: CustomerOrder;
  onSave: (input: CustomerOrderRedirect) => Promise<MutationResult>;
};

type RedirectCustomerOrderForm = { customerDeliveryAddressId: string };

/** Which `validation` section explains the one field (BRIEF §A). */
const VALIDATION_SECTION: Record<keyof RedirectCustomerOrderForm, string> = {
  customerDeliveryAddressId: 'customerOrderDeliveryAddress',
};

/**
 * Redirects one outstanding Customer Order to another **active** Delivery
 * Address of the Customer it already names (AC-11b).
 *
 * The Customer is not an input and never changes: serving a different customer
 * means recording a new Customer Order, which is the rule the refusal states
 * rather than a shape this form could express (AC-11c). The picker is
 * therefore given that one Customer's address book and nothing else — reached
 * through `modules/customer`'s declared public surface rather than rebuilt
 * here — and it opens on the address the order is going to now, so the member
 * sees what they are changing from.
 *
 * It is a `FormModalDialog` rather than a confirmation because a value is
 * chosen and the server can refuse that value (`web-dialogs.md` §1). All three
 * of AC-11c's refusals state a rule rather than reject the shape of what was
 * submitted, and this form has one field, so marking it would say where
 * without saying what; `CustomerOrderRefusalAlert` states each rule instead.
 *
 * The warning states the consequence a member cannot otherwise see: a frozen
 * Purchase Draft Line linked to this order keeps every value it was frozen
 * with and starts reporting Address Drift instead (AC-11b, AC-18).
 */
export const RedirectCustomerOrderDialog = ({
  order,
  onSave,
}: RedirectCustomerOrderDialogProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const { t: translate } = useTranslation('validation');
  const naming = useCustomerOrderNaming();
  const customers = useCustomers();
  const [refusalCode, setRefusalCode] = useState<string>();

  const identity = customerOrderIdentity(order);
  const addresses =
    customers.find((customer) => customer.id === identity.customerId)
      ?.deliveryAddresses ?? [];

  const form = useForm<RedirectCustomerOrderForm>({
    defaultValues: {
      customerDeliveryAddressId: identity.destination?.deliveryAddressId ?? '',
    },
  });
  const {
    control,
    formState: { errors, isSubmitting },
  } = form;

  // The alert steps aside only because the field itself now states the reason:
  // the picker is handed that message alongside `isInvalid`, so a marked field
  // always carries a sentence rather than an empty `FieldError`
  // (`heroui-design-principles.md` §2).
  const isFieldExplained = Object.keys(errors).length > 0;

  const translateValidation = (
    code: string,
    field: keyof RedirectCustomerOrderForm,
  ): string => translate(`${VALIDATION_SECTION[field]}.${code}`);

  return (
    <FormModalDialog
      title={t('dialogs.redirect.title', { customerName: naming(order) })}
      cancelLabel={t('dialogs.redirect.cancel')}
      submitLabel={t('dialogs.redirect.submit')}
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <p className="text-muted">{t('dialogs.redirect.description')}</p>
      <Controller
        control={control}
        name="customerDeliveryAddressId"
        rules={{
          required: translateValidation(
            'required',
            'customerDeliveryAddressId',
          ),
        }}
        render={({ field }) => (
          // AC-06a — the address the order is going to now is kept listed even
          // if it has since been made Inactive, so the field states where the
          // goods are going rather than opening blank.
          <CustomerDeliveryAddressPicker
            retainsDeactivatedValue
            addresses={addresses}
            errorMessage={errors.customerDeliveryAddressId?.message}
            isDisabled={isSubmitting}
            isInvalid={Boolean(errors.customerDeliveryAddressId)}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('dialogs.redirect.drift.heading')}</Alert.Title>
          <Alert.Description>
            {t('dialogs.redirect.drift.body')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <CustomerOrderRefusalAlert
        code={isFieldExplained ? undefined : refusalCode}
        form="redirect"
      />
    </FormModalDialog>
  );
};
