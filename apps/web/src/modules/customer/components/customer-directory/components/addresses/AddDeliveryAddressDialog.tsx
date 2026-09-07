import { Checkbox } from '@heroui/react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { CustomerRefusalAlert } from 'modules/customer/components/customer-directory/components/CustomerRefusalAlert';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextAreaField } from 'shared/components/FormTextAreaField';

import type { CustomerDeliveryAddressCreate } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { Path } from 'react-hook-form';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type AddDeliveryAddressForm = {
  addressText: string;
  accessNotes: string;
  main: boolean;
};

/** Which `validation` section explains each field's rejection. */
const VALIDATION_SECTIONS: Record<Path<AddDeliveryAddressForm>, string> = {
  addressText: 'customerAddressText',
  accessNotes: 'customerAccessNotes',
  main: 'customerAddressText',
};

export type AddDeliveryAddressDialogProps = {
  onSave: (input: CustomerDeliveryAddressCreate) => Promise<MutationResult>;
};

/**
 * Adds a Delivery Address to an existing Customer (`ee6Ez` "Add a delivery
 * address", AC-04). The address arrives **active**, and ordinary unless the
 * member marks it Main — marking it clears the previous Main flag in the same
 * transaction, so exactly one active address is Main at every instant (AC-05).
 *
 * Only the address is required. Nothing else is validated client-side: an
 * address is text a member types and is never interpreted (spec.md §3), so the
 * trimmed-non-empty rule stays the server's.
 */
export const AddDeliveryAddressDialog = ({
  onSave,
}: AddDeliveryAddressDialogProps): ReactElement => {
  const { t } = useTranslation('customer');
  const { t: translate } = useTranslation('validation');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<AddDeliveryAddressForm>({
    defaultValues: { accessNotes: '', addressText: '', main: false },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const translateValidation = (
    code: string,
    field: Path<AddDeliveryAddressForm>,
  ): string => translate(`${VALIDATION_SECTIONS[field]}.${code}`);

  // `accessNotes` is `null` when none was recorded and never an empty string
  // (`accessNotesSchema`), so the empty field is submitted as `null`.
  const onSubmit = (values: AddDeliveryAddressForm): Promise<MutationResult> =>
    onSave({
      addressText: values.addressText,
      accessNotes: values.accessNotes.trim() === '' ? null : values.accessNotes,
      main: values.main,
    });

  return (
    <FormModalDialog<AddDeliveryAddressForm>
      title={t('dialogs.addAddress.title')}
      cancelLabel={t('dialogs.addAddress.cancel')}
      submitLabel={t('dialogs.addAddress.submit')}
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
      <p className="text-muted">{t('dialogs.addAddress.lede')}</p>
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
        description={t('dialogs.addAddress.addressHelp')}
        label={t('dialogs.addAddress.addressLabel')}
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
        description={t('dialogs.addAddress.accessNotesHelp')}
        label={t('dialogs.addAddress.accessNotesLabel')}
        isDisabled={isSubmitting}
        rows={2}
        {...register('accessNotes')}
      />
      {/* HeroUI's `Checkbox` is a `isSelected`/`onChange(boolean)` control
          rather than a native input `register()` can bind, so React Hook Form
          owns it through a `Controller` — the same way every `Select` in this
          application is bound. */}
      <Controller
        control={form.control}
        name="main"
        render={({ field }) => (
          <Checkbox
            isDisabled={isSubmitting}
            isSelected={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          >
            <Checkbox.Content>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <span>{t('dialogs.addAddress.mainLabel')}</span>
            </Checkbox.Content>
          </Checkbox>
        )}
      />
      <CustomerRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
