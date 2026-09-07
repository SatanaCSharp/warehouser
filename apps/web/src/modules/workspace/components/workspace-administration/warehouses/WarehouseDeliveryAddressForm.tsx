import { Alert, Button } from '@heroui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { useSetWarehouseDeliveryAddressMutation } from 'modules/workspace/api/warehouse-api';
import { mutationOutcome } from 'shared/api/client/mutation-outcome';
import { FormTextAreaField } from 'shared/components/FormTextAreaField';
import { useFormFieldErrors } from 'shared/hooks/forms/useFormFieldErrors';

import type {
  Warehouse,
  WarehouseDeliveryAddress,
} from '@warehouser/contracts/workspaces';
import type { FormEvent, ReactElement } from 'react';

type WarehouseDeliveryAddressFormProps = {
  /** What is recorded now, which the section remounts this form to re-seed. */
  recorded: WarehouseDeliveryAddress | undefined;
  warehouse: Warehouse;
};

type WarehouseDeliveryAddressFormValues = {
  addressText: string;
  accessNotes: string;
};

/**
 * Records the Warehouse's one Delivery Address and corrects it in place
 * afterwards (AC-10). There is no clearing or deactivating control, because
 * there is no such operation: an address, once recorded, is corrected and
 * never withdrawn.
 *
 * Mounted only by `WarehouseDeliveryAddressSection`, behind the
 * `WAREHOUSES:ADDRESS_UPDATE` gate, which also owns the read this form is
 * seeded from and the remount that re-seeds it.
 *
 * The address is text a member types and the server never validates,
 * geocodes or interprets it, so the one rule over it — that something was
 * typed — is stated by the server and explained here through the key the
 * endpoint's `transformErrorResponse` attached. It is not restated
 * client-side (`design-handoff.md` § Component mapping).
 */
export const WarehouseDeliveryAddressForm = ({
  recorded,
  warehouse,
}: WarehouseDeliveryAddressFormProps): ReactElement => {
  const addressText = recorded?.addressText ?? '';
  const accessNotes = recorded?.accessNotes ?? '';
  const { t } = useTranslation('warehouse');
  const { t: translateValidation } = useTranslation('validation');
  const [setWarehouseDeliveryAddress] =
    useSetWarehouseDeliveryAddressMutation();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<WarehouseDeliveryAddressFormValues>({
    defaultValues: { addressText, accessNotes },
  });
  const { setFieldError } =
    useFormFieldErrors<WarehouseDeliveryAddressFormValues>(setError);

  const submit = async (
    values: WarehouseDeliveryAddressFormValues,
  ): Promise<void> => {
    // Not a `FormModalDialog`: this form stays on the page rather than
    // closing, so it normalizes the settled request itself.
    const outcome = mutationOutcome(
      await setWarehouseDeliveryAddress({
        warehouseId: warehouse.id,
        addressText: values.addressText,
        // Access notes are never recorded as an empty string: what a driver
        // needs to get in was either written down or it was not.
        accessNotes:
          values.accessNotes.trim() === '' ? null : values.accessNotes,
      }),
    );
    if (!outcome.success) {
      setFieldError(
        'addressText',
        outcome.fieldErrors?.addressText,
        translateValidation,
      );
    }
  };

  // `handleSubmit` returns a promise the DOM handler must not; discarding it
  // here keeps the rejection with React Hook Form, which already owns it.
  const onSubmitForm = (event: FormEvent<HTMLFormElement>): void =>
    void handleSubmit(submit)(event);

  // Cancel abandons the correction rather than the address: the fields go back
  // to what is recorded, and nothing is sent.
  const onPressCancel = (): void => reset({ addressText, accessNotes });

  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={onSubmitForm}>
      {/*
        An address and the notes under it are long by nature and must wrap
        rather than truncate, so both are the multi-line field the design draws
        them as (design-handoff.md §"Component mapping": "Address and access
        notes are the 56px-tall variant").
      */}
      <FormTextAreaField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.addressText)}
        errorMessage={errors.addressText?.message}
        defaultValue={addressText}
        label={t('warehouses.deliveryAddress.addressLabel')}
        description={t('warehouses.deliveryAddress.addressDescription')}
        isDisabled={isSubmitting}
        rows={2}
        {...register('addressText')}
      />
      <FormTextAreaField
        validationBehavior="aria"
        defaultValue={accessNotes}
        label={t('warehouses.deliveryAddress.accessNotesLabel')}
        description={t('warehouses.deliveryAddress.accessNotesDescription')}
        isDisabled={isSubmitting}
        rows={2}
        {...register('accessNotes')}
      />
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {t('warehouses.deliveryAddress.freezeNoteTitle')}
          </Alert.Title>
          <Alert.Description>
            {t('warehouses.deliveryAddress.freezeNoteDescription')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      {/*
        Cancel precedes the primary in DOM — and therefore keyboard — order, as
        it does in every dialog footer (design-handoff.md §"Component mapping").
      */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          isDisabled={isSubmitting}
          onPress={onPressCancel}
        >
          {t('warehouses.detail.cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          isDisabled={isSubmitting}
          isPending={isSubmitting}
        >
          {t('warehouses.deliveryAddress.save')}
        </Button>
      </div>
    </form>
  );
};
