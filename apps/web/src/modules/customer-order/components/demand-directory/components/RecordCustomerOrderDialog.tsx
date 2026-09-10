import type { CustomerOrderCreate } from '@warehouser/contracts/customer-orders';
import { CustomerOrderRefusalAlert } from 'modules/customer-order/components/demand-directory/components/CustomerOrderRefusalAlert';
import { RecordCustomerOrderCustomerFields } from 'modules/customer-order/components/demand-directory/components/record-customer-order-customer-fields/RecordCustomerOrderCustomerFields';
import type { RecordCustomerOrderForm } from 'modules/customer-order/utils/record-customer-order-form';
import { ItemPicker } from 'modules/item/components/ItemPicker';
import { useItems } from 'modules/item/hooks/queries/useItems';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { FormDateField } from 'shared/components/FormDateField';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

type RecordCustomerOrderDialogProps = {
  /** Pre-selects the Item when opened from a Demand Line's own action. */
  presetItemId?: string;
  onSave: (input: CustomerOrderCreate) => Promise<MutationResult>;
};

/**
 * What the quantity field opens on. The form's default and the field's rendered
 * value are the same constant: an uncontrolled `Input` shows nothing unless it
 * is given one, so a form defaulting to 1 with a blank field made the dialog
 * unsubmittable until the member retyped the value it claimed to hold.
 */
const DEFAULT_QUANTITY = 1;

/**
 * Which `validation` section explains each field. The five normalized codes the
 * server can return (`required`, `tooSmall`, `tooBig`, `notMultipleOf`,
 * `invalid`) plus this form's domain refusals are answered under one section
 * per field, so `translateValidation` is total over everything that can arrive
 * (BRIEF §A).
 */
const VALIDATION_SECTION: Record<keyof RecordCustomerOrderForm, string> = {
  itemId: 'customerOrderItem',
  customerId: 'customerOrderCustomer',
  customerDeliveryAddressId: 'customerOrderDeliveryAddress',
  customerName: 'customerOrderCustomerName',
  quantity: 'customerOrderQuantity',
  neededBy: 'customerOrderNeededBy',
};

/**
 * Records a named customer's demand as Unfulfilled (AC-01), and names the value
 * it will not accept when the server refuses one (AC-02, AC-02a).
 *
 * Every rule is decided server-side and none is duplicated here: quantity and
 * customer name are checked against the request schema, and whether the
 * needed-by date has already passed is decided against the *server's* clock,
 * which is why AC-02a arrives as the domain code
 * `customer_orders.needed_by_in_past` rather than as a Zod issue. The endpoint
 * binds it to the `neededBy` field (`api/customer-order-api.ts`), and
 * `translateValidation` below turns the bound code into the message that field
 * shows — so a refusal marks the value it is about instead of one sentence
 * saying nothing changed (`web-dialogs.md` §2, §3).
 *
 * `CustomerOrderRefusalAlert` covers the other half: a `request.invalid` that
 * names no field at all, which is what a cross-field rule produces.
 *
 * Reaches the Item picker through `modules/item`'s declared public surface
 * rather than promoting it to `shared/`.
 */
export const RecordCustomerOrderDialog = ({
  presetItemId,
  onSave,
}: RecordCustomerOrderDialogProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const { t: translate } = useTranslation('validation');
  const items = useItems();
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<RecordCustomerOrderForm>({
    defaultValues: {
      itemId: presetItemId ?? '',
      customerId: '',
      customerDeliveryAddressId: '',
      customerName: '',
      quantity: DEFAULT_QUANTITY,
      neededBy: '',
    },
  });
  const {
    control,
    formState: { errors, isSubmitting },
    register,
  } = form;
  // AC-11 / AC-11a — the two ways of naming a customer are mutually exclusive
  // (`chk_customer_orders_customer_identity`), so choosing a Customer takes
  // the typed name out of play rather than leaving both submittable and
  // letting the server decide which the member meant.
  const customerId = useWatch({ control, name: 'customerId' });
  const namesACustomer = customerId !== '';

  const isFieldExplained = Object.keys(errors).length > 0;

  const translateValidation = (
    code: string,
    field: keyof RecordCustomerOrderForm,
  ): string => translate(`${VALIDATION_SECTION[field]}.${code}`);

  /**
   * Which identity the submission carries. An order naming a Customer sends
   * `customerId` and never a typed name; one recorded by typed name sends the
   * name and neither identifier. An address is stated only for the first, and
   * omitting it takes the Customer's current Main one (AC-11, AC-11a).
   */
  const identityOf = (
    values: RecordCustomerOrderForm,
  ): Pick<
    CustomerOrderCreate,
    'customerId' | 'customerDeliveryAddressId' | 'customerName'
  > =>
    values.customerId === ''
      ? { customerName: values.customerName }
      : {
          customerId: values.customerId,
          customerDeliveryAddressId:
            values.customerDeliveryAddressId === ''
              ? undefined
              : values.customerDeliveryAddressId,
        };

  const onSubmit = (values: RecordCustomerOrderForm): Promise<MutationResult> =>
    onSave({
      itemId: values.itemId,
      ...identityOf(values),
      quantity: values.quantity,
      neededBy: values.neededBy,
    });

  return (
    <FormModalDialog
      title={t('dialogs.record.title')}
      cancelLabel={t('dialogs.record.cancel')}
      submitLabel={t('dialogs.record.submit')}
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
      <p className="text-muted">{t('dialogs.record.description')}</p>
      <RecordCustomerOrderCustomerFields
        control={control}
        isDisabled={isSubmitting}
      />
      <FormTextField
        autoFocus
        validationBehavior="aria"
        description={
          namesACustomer
            ? t('dialogs.record.customerNameSupersededHelp')
            : t('dialogs.record.customerNameHelp')
        }
        isInvalid={Boolean(errors.customerName)}
        errorMessage={errors.customerName?.message}
        label={t('dialogs.record.customerNameLabel')}
        isDisabled={isSubmitting || namesACustomer}
        {...register('customerName', {
          validate: (value, values) =>
            values.customerId !== '' ||
            value.trim() !== '' ||
            translateValidation('required', 'customerName'),
        })}
      />
      <Controller
        control={control}
        name="itemId"
        rules={{ required: translateValidation('required', 'itemId') }}
        render={({ field }) => (
          // The helper is the field's own `description`, not a loose paragraph
          // beside it: the dialog board draws it under the control, and a
          // sentence that is only positioned there is never announced with the
          // field it explains (`s5EPi` "Record demand").
          <ItemPicker
            description={t('dialogs.record.itemHelp')}
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
        isRequired
        validationBehavior="aria"
        type="number"
        defaultValue={String(DEFAULT_QUANTITY)}
        description={t('dialogs.record.quantityHelp')}
        isInvalid={Boolean(errors.quantity)}
        errorMessage={errors.quantity?.message}
        label={t('dialogs.record.quantityLabel')}
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
            description={t('dialogs.record.neededByHelp')}
            isInvalid={Boolean(errors.neededBy)}
            errorMessage={errors.neededBy?.message}
            label={t('dialogs.record.neededByLabel')}
            isDisabled={isSubmitting}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
      {/* A refusal that already marked a field says everything it has to say
          there; the alert is for the refusals that name none. */}
      <CustomerOrderRefusalAlert
        code={isFieldExplained ? undefined : refusalCode}
        form="record"
      />
    </FormModalDialog>
  );
};
