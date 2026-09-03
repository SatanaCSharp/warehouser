import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CustomerRefusalAlert } from 'modules/customer/components/customer-directory/components/CustomerRefusalAlert';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { CustomerCreate } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { Path } from 'react-hook-form';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type RecordCustomerForm = {
  name: string;
  addressText: string;
  accessNotes: string;
};

/** Which `validation` section explains each field's rejection. */
const VALIDATION_SECTIONS: Record<Path<RecordCustomerForm>, string> = {
  name: 'customerName',
  addressText: 'customerAddressText',
  accessNotes: 'customerAccessNotes',
};

export type RecordCustomerDialogProps = {
  onSave: (input: CustomerCreate) => Promise<MutationResult>;
};

/**
 * Records a Customer **with its first Delivery Address in one transaction**
 * (`ee6Ez` "Record a customer", AC-01). The address is not optional: a
 * Customer always keeps at least one active Delivery Address, and recording
 * one without an address would be the very state AC-07 refuses to produce.
 *
 * The name and the address are required, which react-hook-form's own `rules`
 * enforce, so no `parse` step is needed
 * (`docs/system/guides/web-dialogs.md` §3). Nothing else is validated here:
 * an address is text a member types and is never geocoded, normalized or
 * interpreted (spec.md §3), and the trimmed-non-empty rule belongs to the
 * server's value object — duplicating it client-side would be the second
 * source of truth `HeroUI/Field` explicitly warns against.
 *
 * A refused name (AC-03) is stated **on the name field**; a refusal no field
 * explains falls to `CustomerRefusalAlert`.
 */
export const RecordCustomerDialog = ({
  onSave,
}: RecordCustomerDialogProps): ReactElement => {
  const { t } = useTranslation('customer');
  const { t: translate } = useTranslation('validation');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<RecordCustomerForm>({
    defaultValues: { accessNotes: '', addressText: '', name: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const translateValidation = (
    code: string,
    field: Path<RecordCustomerForm>,
  ): string =>
    translate(`${VALIDATION_SECTIONS[field]}.${code}`, {
      name: form.getValues('name'),
    });

  // `accessNotes` is `null` when none was recorded and **never** an empty
  // string (`accessNotesSchema`), so the empty field is submitted as `null`
  // rather than as `''`, which the contract refuses.
  const onSubmit = (values: RecordCustomerForm): Promise<MutationResult> =>
    onSave({
      name: values.name,
      deliveryAddress: {
        addressText: values.addressText,
        accessNotes:
          values.accessNotes.trim() === '' ? null : values.accessNotes,
      },
    });

  return (
    <FormModalDialog<RecordCustomerForm>
      title={t('dialogs.record.title')}
      cancelLabel={t('dialogs.record.cancel')}
      submitLabel={t('dialogs.record.submit')}
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
      <p className="text-muted">{t('dialogs.record.lede')}</p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.name)}
        errorMessage={errors.name?.message}
        label={t('dialogs.record.nameLabel')}
        isDisabled={isSubmitting}
        {...register('name', { required: translate('customerName.required') })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.addressText)}
        errorMessage={errors.addressText?.message}
        description={t('dialogs.record.addressHelp')}
        label={t('dialogs.record.addressLabel')}
        isDisabled={isSubmitting}
        {...register('addressText', {
          required: translate('customerAddressText.required'),
        })}
      />
      <FormTextField
        validationBehavior="aria"
        isInvalid={Boolean(errors.accessNotes)}
        errorMessage={errors.accessNotes?.message}
        description={t('dialogs.record.accessNotesHelp')}
        label={t('dialogs.record.accessNotesLabel')}
        isDisabled={isSubmitting}
        {...register('accessNotes')}
      />
      <p className="text-sm text-muted">{t('dialogs.record.note')}</p>
      <CustomerRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
