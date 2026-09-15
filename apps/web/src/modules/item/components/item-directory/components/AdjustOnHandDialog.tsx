import type { Item, OnHandAdjustmentCreate } from '@warehouser/contracts/items';
import { ItemRefusalAlert } from 'modules/item/components/item-directory/components/ItemRefusalAlert';
import type { ReactElement } from 'react';
import { useState } from 'react';
import type { Path } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

type AdjustOnHandDialogProps = {
  item: Item;
  onSave: (input: OnHandAdjustmentCreate) => Promise<MutationResult>;
};

type AdjustOnHandForm = { countedQuantity: number; reason: string };

/** Which `validation` section explains each field's rejection. */
const validationSections: Record<Path<AdjustOnHandForm>, string> = {
  countedQuantity: 'itemOnHandCount',
  reason: 'itemAdjustmentReason',
};

/**
 * Sets an Item's On-hand Quantity to a counted figure with a stated reason
 * (AC-08; frames `s5EPi` / `blZtz` "Set the on-hand quantity"). The Item is
 * named by a disabled field rather than by the title, exactly as the frame
 * draws it, so the subject is stated without the heading growing an SKU.
 *
 * The server alone enforces the whole-number/non-negative range (AC-09) — no
 * Zod or hand-rolled pre-check on `countedQuantity` duplicates it here
 * (design-handoff.md § Component mapping). What arrives back is bound to the
 * field it belongs to by the endpoint (`api/item-api.ts`) and turned into its
 * sentence by `translateValidation`, so a refused figure is explained under the
 * figure rather than as "nothing has changed".
 *
 * The reason is never optional (AC-09a): react-hook-form's own `required` rule
 * blocks the request before it is made, and the same copy explains the server's
 * refusal if one is reached anyway.
 */
export const AdjustOnHandDialog = ({
  item,
  onSave,
}: AdjustOnHandDialogProps): ReactElement => {
  const { t } = useTranslation('item');
  const { t: translate } = useTranslation('validation');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<AdjustOnHandForm>({
    defaultValues: { countedQuantity: item.onHandQuantity, reason: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const translateValidation = (
    code: string,
    field: Path<AdjustOnHandForm>,
  ): string => translate(`${validationSections[field]}.${code}`);

  return (
    <FormModalDialog
      title={t('dialogs.adjustOnHand.title')}
      cancelLabel={t('dialogs.adjustOnHand.cancel')}
      submitLabel={t('dialogs.adjustOnHand.submit')}
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <p className="text-muted">{t('dialogs.adjustOnHand.lede')}</p>
      <FormTextField
        isDisabled
        defaultValue={t('dialogs.adjustOnHand.itemValue', {
          sku: item.sku,
          description: item.description,
        })}
        label={t('dialogs.adjustOnHand.itemLabel')}
      />
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        type="number"
        isInvalid={Boolean(errors.countedQuantity)}
        errorMessage={errors.countedQuantity?.message}
        defaultValue={String(item.onHandQuantity)}
        description={t('dialogs.adjustOnHand.quantityHelp')}
        label={t('dialogs.adjustOnHand.quantityLabel')}
        isDisabled={isSubmitting}
        {...register('countedQuantity', {
          required: translate('itemOnHandCount.required'),
          valueAsNumber: true,
        })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.reason)}
        errorMessage={errors.reason?.message}
        description={t('dialogs.adjustOnHand.reasonHelp')}
        label={t('dialogs.adjustOnHand.reasonLabel')}
        isDisabled={isSubmitting}
        {...register('reason', {
          required: translate('itemAdjustmentReason.required'),
        })}
      />
      <p className="text-sm text-muted">{t('dialogs.adjustOnHand.note')}</p>
      <ItemRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
