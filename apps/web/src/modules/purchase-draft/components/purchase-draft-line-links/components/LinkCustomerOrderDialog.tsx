import { ErrorCode } from '@warehouser/shared-types/enums';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CustomerOrderPicker } from 'modules/customer-order/components/CustomerOrderPicker';
import { AddressDisagreementAlert } from 'modules/purchase-draft/components/purchase-draft-line-links/components/AddressDisagreementAlert';
import { PurchaseDraftRefusalAlert } from 'modules/purchase-draft/components/PurchaseDraftRefusalAlert';
import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import type { PurchaseDraftLineLinkCreate } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type LinkCustomerOrderDialogProps = {
  /** The Unfulfilled Customer Orders of this line's Item, and only those (AC-04, AC-11). */
  customerOrders: CustomerOrder[];
  /** Which line of the draft this is, as the frames number them from 1. */
  index: number;
  /**
   * The address this line ships to, for the AC-15 refusal that names it —
   * `null` for a Via Warehouse line, which this refusal never reaches.
   */
  lineDeliveryAddressText: string | null;
  /** The unit this line's quantities are counted in, named in the field's helper text. */
  unitOfMeasure: string;
  onSave: (input: PurchaseDraftLineLinkCreate) => Promise<MutationResult>;
};

type LinkCustomerOrderForm = {
  customerOrderId: string;
  statedQuantity: number;
};

/** Which `validation` section explains a refusal of each field (web-dialogs.md §3). */
const VALIDATION_SECTION: Record<keyof LinkCustomerOrderForm, string> = {
  customerOrderId: 'purchaseDraftLinkOrder',
  statedQuantity: 'purchaseDraftLinkQuantity',
};

/**
 * The refusals that name the Customer Order rather than the quantity, and the
 * `validation` key each of them reads as.
 *
 * `modules/customer-order`'s picker takes no `errorMessage`, so a field message
 * set on `customerOrderId` has nowhere to render inside it. The endpoint still
 * binds these codes to that field — a picker that later grows the prop shows
 * them without a change here — and this dialog *also* explains the refusal
 * where the decision was made, which is what `web-dialogs.md` §6 is for. Both
 * read the same sentence out of `validation.json`, so there is one copy of it.
 *
 * The table is deliberately not the whole answer: a code outside it, and a
 * `request.invalid` that names no field at all, are answered by
 * `PurchaseDraftRefusalAlert`'s own fallback rather than leaving the dialog
 * open and silent (BRIEF §A note 2).
 *
 * AC-15's `delivery_address_disagreement` maps to `null` — silenced here —
 * because it reads as `AddressDisagreementAlert` instead, which names the two
 * addresses this table's static `validation` sentences cannot interpolate.
 */
const ORDER_REFUSAL_CODES: Record<string, string | null> = {
  [ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE]:
    'purchaseDraftLinkOrder.unavailable',
  [ErrorCode.PURCHASE_DRAFTS_LINK_EXISTS]: 'purchaseDraftLinkOrder.exists',
  [ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN]: 'purchaseDraftLinkOrder.frozen',
  [ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT]: null,
};

/**
 * Links one Purchase Draft Line to a Customer Order, stating how much of the
 * line is intended for that customer (AC-10, AC-10a, AC-11a) — the step that
 * turns "what we are ordering" into "who each line is for", and therefore the
 * step the frozen view, the Drift Signal and the Arrival Confirmation's
 * assignment section were all waiting on.
 *
 * **The link claims nothing (AC-11a).** Nothing here compares the stated
 * quantity against the line's ordered quantity, against another link's
 * quantity, or against what the Customer Order is still waiting for, and
 * nothing warns when two overlap: coverage is the member's decision, and only
 * goods that actually arrive reduce what a customer is waiting for.
 *
 * Both fields are only ever required, which react-hook-form's `rules` already
 * enforce, so no `parse` restates the server's rules (`web-dialogs.md` §3).
 * `translateValidation` is still passed, because the refusals this dialog can
 * be given — a Customer Order of another Warehouse, a link that already exists
 * — arrive as field errors the endpoint bound to a field (BRIEF §A).
 */
export const LinkCustomerOrderDialog = ({
  customerOrders,
  index,
  lineDeliveryAddressText,
  unitOfMeasure,
  onSave,
}: LinkCustomerOrderDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { t: translate } = useTranslation('validation');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<LinkCustomerOrderForm>({
    defaultValues: { customerOrderId: '', statedQuantity: 1 },
  });
  const {
    control,
    formState: { errors, isSubmitting },
    register,
  } = form;
  // AC-15 — which order the member picked, read reactively so the refusal
  // alert can name the address it is bound for without a second copy of the
  // server's own identifier-only envelope.
  const selectedOrderId = useWatch({ control, name: 'customerOrderId' });
  const selectedOrder = customerOrders.find(
    (order) => order.id === selectedOrderId,
  );
  const orderDeliveryAddressText =
    selectedOrder !== undefined && 'destination' in selectedOrder
      ? (selectedOrder.destination?.addressText ?? null)
      : null;

  const translateValidation = (
    code: string,
    field: keyof LinkCustomerOrderForm,
  ): string => translate(`${VALIDATION_SECTION[field]}.${code}`);

  const onSubmit = (values: LinkCustomerOrderForm): Promise<MutationResult> =>
    onSave({
      customerOrderId: values.customerOrderId,
      statedQuantity: values.statedQuantity,
    });

  return (
    <FormModalDialog
      title={t('dialogs.addLink.title', { index })}
      cancelLabel={t('dialogs.addLink.cancel')}
      submitLabel={t('dialogs.addLink.submit')}
      form={form}
      isSubmitDisabled={customerOrders.length === 0}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
      <p>{t('dialogs.addLink.body')}</p>
      <Controller
        control={control}
        name="customerOrderId"
        rules={{ required: true }}
        render={({ field }) => (
          <CustomerOrderPicker
            customerOrders={customerOrders}
            isDisabled={isSubmitting}
            isInvalid={Boolean(errors.customerOrderId)}
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
        description={t('dialogs.addLink.quantityDescription', {
          unit: unitOfMeasure,
        })}
        isInvalid={Boolean(errors.statedQuantity)}
        errorMessage={errors.statedQuantity?.message}
        label={t('dialogs.addLink.quantityLabel')}
        isDisabled={isSubmitting}
        {...register('statedQuantity', {
          required: true,
          valueAsNumber: true,
        })}
      />
      {/* A line whose Item nobody is waiting for has nothing to link to yet.
          The submit stays visible and disabled with the reason stated, rather
          than offering a picker with no options (frame `hWFRW`). */}
      <Conditional when={customerOrders.length === 0}>
        <p className="text-sm text-muted">
          {t('dialogs.addLink.noCustomerOrders')}
        </p>
      </Conditional>
      <PurchaseDraftRefusalAlert
        code={refusalCode}
        codes={ORDER_REFUSAL_CODES}
      />
      <AddressDisagreementAlert
        code={refusalCode}
        lineDeliveryAddressText={lineDeliveryAddressText}
        orderDeliveryAddressText={orderDeliveryAddressText}
      />
    </FormModalDialog>
  );
};
