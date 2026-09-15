import type { PurchaseDraftLineCreate } from '@warehouser/contracts/purchase-drafts';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ItemPicker } from 'modules/item/components/ItemPicker';
import { useItems } from 'modules/item/hooks/queries/useItems';
import { PurchaseDraftRefusalAlert } from 'modules/purchase-draft/components/PurchaseDraftRefusalAlert';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

type AddPurchaseDraftLineDialogProps = {
  /** The draft's human reference, which the title names it by (`s5EPi`). */
  reference: string;
  onSave: (input: PurchaseDraftLineCreate) => Promise<MutationResult>;
};

type AddPurchaseDraftLineForm = {
  itemId: string;
  orderedQuantity: number;
};

/** Which `validation` section explains a refusal of each field (web-dialogs.md §3). */
const VALIDATION_SECTION: Record<keyof AddPurchaseDraftLineForm, string> = {
  itemId: 'purchaseDraftLineItem',
  orderedQuantity: 'purchaseDraftLineQuantity',
};

/**
 * What each refusal this dialog can meet reads as, for the alert that explains
 * the ones no visible field can (`PurchaseDraftRefusalAlert`).
 *
 * `ItemPicker` takes no `errorMessage`, so an unavailable Item — a deactivated
 * one or another Warehouse's, deliberately the same code (BRIEF, "Server
 * refusal shapes that CHANGED") — has nowhere to render inside the field the
 * endpoint bound it to. The Packaging Type is not a field of this dialog at
 * all. The quantity is: it shows its own message, so the alert stays quiet
 * about a frozen draft rather than saying it twice.
 */
const REFUSAL_VALIDATION_KEYS: Record<string, string | null> = {
  [ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE]:
    'purchaseDraftLineItem.unavailable',
  [ErrorCode.PURCHASE_DRAFTS_UNKNOWN_PACKAGING_TYPE]:
    'purchaseDraftLinePackaging.unknown',
  [ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN]: null,
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
  reference,
  onSave,
}: AddPurchaseDraftLineDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { t: translate } = useTranslation('validation');
  const [refusalCode, setRefusalCode] = useState<string>();
  const items = useItems();
  const form = useForm<AddPurchaseDraftLineForm>({
    defaultValues: { itemId: '', orderedQuantity: 1 },
  });
  const {
    control,
    formState: { errors, isSubmitting },
    register,
  } = form;

  // BRIEF §A — a refusal names the value it will not accept rather than
  // reporting that nothing changed. A deactivated Item and an Item of another
  // Warehouse both arrive as `purchase_drafts.target_unavailable`, which the
  // endpoint binds to the Item field (`purchase-draft-api.ts`).
  const translateValidation = (
    code: string,
    field: keyof AddPurchaseDraftLineForm,
  ): string => translate(`${VALIDATION_SECTION[field]}.${code}`);

  const onSubmit = (
    values: AddPurchaseDraftLineForm,
  ): Promise<MutationResult> =>
    onSave({
      itemId: values.itemId,
      orderedQuantity: values.orderedQuantity,
    });

  return (
    <FormModalDialog
      title={t('dialogs.addLine.title', { reference })}
      cancelLabel={t('dialogs.addLine.cancel')}
      submitLabel={t('dialogs.addLine.submit')}
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
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
        description={t('dialogs.addLine.quantityDescription')}
        isInvalid={Boolean(errors.orderedQuantity)}
        errorMessage={errors.orderedQuantity?.message}
        label={t('dialogs.addLine.quantityLabel')}
        isDisabled={isSubmitting}
        {...register('orderedQuantity', {
          required: true,
          valueAsNumber: true,
        })}
      />
      <PurchaseDraftRefusalAlert
        code={refusalCode}
        codes={REFUSAL_VALIDATION_KEYS}
      />
    </FormModalDialog>
  );
};
