import type { Item, ItemUpdate } from '@warehouser/contracts/items';
import { ItemRefusalAlert } from 'modules/item/components/item-directory/components/ItemRefusalAlert';
import { useItemNaming } from 'modules/item/hooks/projections/useItemNaming';
import type { ReactElement } from 'react';
import { useState } from 'react';
import type { Path } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';
import type { FormParseResult } from 'shared/utils/form-parse';

type CorrectItemDialogProps = {
  item: Item;
  /**
   * The catalogue as it was last read, so a SKU corrected to one already in use
   * can name the Item that holds it (AC-07), exactly as `CreateItemDialog`
   * does.
   */
  items: Item[];
  onSave: (input: ItemUpdate) => Promise<MutationResult>;
};

type CorrectItemForm = {
  description: string;
  sku: string;
  unitOfMeasure: string;
};

/** Which `validation` section explains each field's rejection. */
const validationSections: Record<Path<CorrectItemForm>, string> = {
  description: 'itemDescription',
  sku: 'itemSku',
  unitOfMeasure: 'itemUnitOfMeasure',
};

/**
 * Corrects an Item's SKU, description or unit of measure independently
 * (AC-06b, AC-06c; frame `hWFRW` tile `A0OO9m`): changing one leaves the others
 * untouched, so `parse` submits only the fields that changed rather than
 * resending all three.
 *
 * **The SKU field is offered, always.** AC-06c has two halves, and the second
 * one — "an Item nothing yet names may still have its SKU corrected to one
 * unused in that Warehouse" — is unreachable without the field. It is not
 * disabled for an Item something already names either: design-handoff.md
 * § Component mapping forbids duplicating a server validation rule client-side,
 * and the approved frame draws the refusal as a **red message bound to an
 * editable SKU field**, not as a greyed-out control. So the correction is
 * attempted, the server decides, and `translateValidation` turns
 * `items.sku_fixed` into the sentence that names what holds the SKU —
 * `WH-100420 is named by 3 customer orders and 1 draft line, so its SKU is
 * fixed for the life of this item.` The row's own naming line
 * (`ItemNamingLine`) tells the member which half applies before they open this.
 */
export const CorrectItemDialog = ({
  item,
  items,
  onSave,
}: CorrectItemDialogProps): ReactElement => {
  const { t } = useTranslation('item');
  const { t: translate } = useTranslation('validation');
  const naming = useItemNaming(item);
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<CorrectItemForm>({
    defaultValues: {
      description: item.description,
      sku: item.sku,
      unitOfMeasure: item.unitOfMeasure,
    },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const parse = (
    values: CorrectItemForm,
  ): FormParseResult<CorrectItemForm, ItemUpdate> => {
    const changes: ItemUpdate = {};
    if (values.sku !== item.sku) {
      changes.sku = values.sku;
    }
    if (values.description !== item.description) {
      changes.description = values.description;
    }
    if (values.unitOfMeasure !== item.unitOfMeasure) {
      changes.unitOfMeasure = values.unitOfMeasure;
    }
    return { data: changes, success: true };
  };

  const translateValidation = (
    code: string,
    field: Path<CorrectItemForm>,
  ): string => {
    const sku = form.getValues('sku');
    const conflicting = items.find((candidate) => candidate.sku === sku);
    const keysByCode: Record<string, string> = {
      skuFixed: `itemSku.skuFixed.${naming.state}`,
      skuTaken:
        conflicting === undefined
          ? 'itemSku.skuTakenUnnamed'
          : 'itemSku.skuTaken',
    };

    return translate(
      keysByCode[code] ?? `${validationSections[field]}.${code}`,
      {
        // `skuFixed` names the Item as it stands; `skuTaken` names the value
        // that was refused. They are the same field, so both are handed over
        // and each sentence takes the one it interpolates.
        sku: code === 'skuFixed' ? item.sku : sku,
        description: conflicting?.description,
        orders: naming.orders,
        lines: naming.lines,
      },
    );
  };

  return (
    <FormModalDialog
      title={t('dialogs.correct.title', {
        sku: item.sku,
        description: item.description,
      })}
      cancelLabel={t('dialogs.correct.cancel')}
      submitLabel={t('dialogs.correct.submit')}
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.sku)}
        errorMessage={errors.sku?.message}
        defaultValue={item.sku}
        description={t('dialogs.correct.skuHelp')}
        label={t('dialogs.correct.skuLabel')}
        isDisabled={isSubmitting}
        {...register('sku', { required: translate('itemSku.required') })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.description)}
        errorMessage={errors.description?.message}
        defaultValue={item.description}
        description={t('dialogs.correct.descriptionHelp')}
        label={t('dialogs.correct.descriptionLabel')}
        isDisabled={isSubmitting}
        {...register('description', {
          required: translate('itemDescription.required'),
        })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.unitOfMeasure)}
        errorMessage={errors.unitOfMeasure?.message}
        defaultValue={item.unitOfMeasure}
        label={t('dialogs.correct.unitOfMeasureLabel')}
        isDisabled={isSubmitting}
        {...register('unitOfMeasure', {
          required: translate('itemUnitOfMeasure.required'),
        })}
      />
      <p className="text-sm text-muted">{t('dialogs.correct.note')}</p>
      <ItemRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
