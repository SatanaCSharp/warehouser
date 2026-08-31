import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ItemPicker } from 'modules/item/components/ItemPicker';
import { useItems } from 'modules/item/hooks/queries/useItems';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { PurchaseDraftLineCreate } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type AddPurchaseDraftLineDialogProps = {
  onSave: (input: PurchaseDraftLineCreate) => Promise<MutationResult>;
};

type AddPurchaseDraftLineForm = {
  itemId: string;
  orderedQuantity: number;
};

/**
 * Adds one Item and its ordered quantity to a Purchase Draft in the Draft state
 * (AC-10, AC-10a) — the step that turns an empty draft into one that says what
 * is being ordered, and therefore the step the readiness transition's own
 * "add a line first" refusal was waiting on.
 *
 * Only the two properties a line cannot exist without are collected here. The
 * Pre-receipt Requirement (Packaging Type, Value-adding Note) and the links to
 * Customer Orders are stated afterwards on the line itself, where
 * `PurchaseDraftLineEditor` already owns them — so this dialog does not
 * duplicate fields that have a home.
 *
 * Both fields are only ever required, which react-hook-form's `rules` already
 * enforce, so no `parse` restates the server's rules
 * (`web-dialogs.md` §3, last paragraph).
 */
export const AddPurchaseDraftLineDialog = ({
  onSave,
}: AddPurchaseDraftLineDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const items = useItems();
  const form = useForm<AddPurchaseDraftLineForm>({
    defaultValues: { itemId: '', orderedQuantity: 1 },
  });
  const {
    control,
    formState: { errors, isSubmitting },
    register,
  } = form;

  const onSubmit = (
    values: AddPurchaseDraftLineForm,
  ): Promise<MutationResult> =>
    onSave({
      itemId: values.itemId,
      orderedQuantity: values.orderedQuantity,
    });

  return (
    <FormModalDialog
      title={t('dialogs.addLine.title')}
      cancelLabel={t('dialogs.addLine.cancel')}
      submitLabel={t('dialogs.addLine.submit')}
      form={form}
      onSubmit={onSubmit}
    >
      <Controller
        control={control}
        name="itemId"
        rules={{ required: true }}
        render={({ field }) => (
          <ItemPicker
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
        isInvalid={Boolean(errors.orderedQuantity)}
        errorMessage={errors.orderedQuantity?.message}
        label={t('dialogs.addLine.quantityLabel')}
        isDisabled={isSubmitting}
        {...register('orderedQuantity', {
          required: true,
          valueAsNumber: true,
        })}
      />
    </FormModalDialog>
  );
};
