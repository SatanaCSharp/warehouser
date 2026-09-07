import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CustomerRefusalAlert } from 'modules/customer/components/customer-directory/components/CustomerRefusalAlert';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextAreaField } from 'shared/components/FormTextAreaField';

import type {
  CustomerDeliveryAddress,
  CustomerDeliveryAddressUpdate,
} from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { Path } from 'react-hook-form';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type CorrectDeliveryAddressForm = {
  addressText: string;
  accessNotes: string;
};

const VALIDATION_SECTIONS: Record<Path<CorrectDeliveryAddressForm>, string> = {
  addressText: 'customerAddressText',
  accessNotes: 'customerAccessNotes',
};

export type CorrectDeliveryAddressDialogProps = {
  address: CustomerDeliveryAddress;
  onSave: (input: CustomerDeliveryAddressUpdate) => Promise<MutationResult>;
};

/**
 * Corrects a Delivery Address **in place** (AC-16/AC-17): every Customer Order
 * and every live Purchase Draft Line naming it follows the correction, while a
 * frozen line keeps the text it captured. An Inactive address is correctable
 * too — fixing a typo on an address a Customer Order still names is worth
 * doing whether or not the address is still offered.
 *
 * `accessNotes` distinguishes "not submitted" from "clear these": an emptied
 * field submits `null`, which is what clears them
 * (`customerDeliveryAddressUpdateSchema`).
 */
export const CorrectDeliveryAddressDialog = ({
  address,
  onSave,
}: CorrectDeliveryAddressDialogProps): ReactElement => {
  const { t } = useTranslation('customer');
  const { t: translate } = useTranslation('validation');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<CorrectDeliveryAddressForm>({
    defaultValues: {
      accessNotes: address.accessNotes ?? '',
      addressText: address.addressText,
    },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const translateValidation = (
    code: string,
    field: Path<CorrectDeliveryAddressForm>,
  ): string => translate(`${VALIDATION_SECTIONS[field]}.${code}`);

  const onSubmit = (
    values: CorrectDeliveryAddressForm,
  ): Promise<MutationResult> =>
    onSave({
      addressText: values.addressText,
      accessNotes: values.accessNotes.trim() === '' ? null : values.accessNotes,
    });

  return (
    <FormModalDialog<CorrectDeliveryAddressForm>
      title={t('dialogs.correctAddress.title')}
      cancelLabel={t('dialogs.correctAddress.cancel')}
      submitLabel={t('dialogs.correctAddress.submit')}
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
      <p className="text-muted">{t('dialogs.correctAddress.lede')}</p>
      {/*
        An address and the notes under it are long by nature and must wrap
        rather than truncate, so both are the multi-line field the design
        draws them as (design-handoff.md §"Component mapping": "Address and
        access notes are the 56px-tall variant").
      */}
      <FormTextAreaField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.addressText)}
        errorMessage={errors.addressText?.message}
        defaultValue={address.addressText}
        label={t('dialogs.correctAddress.addressLabel')}
        isDisabled={isSubmitting}
        rows={2}
        {...register('addressText', {
          required: translate('customerAddressText.required'),
        })}
      />
      <FormTextAreaField
        validationBehavior="aria"
        isInvalid={Boolean(errors.accessNotes)}
        errorMessage={errors.accessNotes?.message}
        description={t('dialogs.correctAddress.accessNotesHelp')}
        defaultValue={address.accessNotes ?? ''}
        label={t('dialogs.correctAddress.accessNotesLabel')}
        isDisabled={isSubmitting}
        rows={2}
        {...register('accessNotes')}
      />
      <p className="text-sm text-muted">{t('dialogs.correctAddress.note')}</p>
      <CustomerRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
