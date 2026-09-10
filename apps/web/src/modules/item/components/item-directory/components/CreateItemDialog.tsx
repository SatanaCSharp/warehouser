import type { Item, ItemCreate } from '@warehouser/contracts/items';
import { ItemRefusalAlert } from 'modules/item/components/item-directory/components/ItemRefusalAlert';
import type { ReactElement } from 'react';
import { useState } from 'react';
import type { Path } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

type CreateItemDialogProps = {
  /**
   * The catalogue as it was last read. AC-07 requires the refusal to name the
   * Item that already holds the SKU, and the server's envelope carries the SKU
   * but no description — so the Item is looked up here, where the catalogue
   * already is.
   */
  items: Item[];
  onSave: (input: ItemCreate) => Promise<MutationResult>;
};

type CreateItemForm = {
  description: string;
  sku: string;
  unitOfMeasure: string;
};

/** Which `validation` section explains each field's rejection. */
const validationSections: Record<Path<CreateItemForm>, string> = {
  description: 'itemDescription',
  sku: 'itemSku',
  unitOfMeasure: 'itemUnitOfMeasure',
};

/**
 * Records an Item as active with nothing on hand (AC-06, frame `s5EPi` "Add an
 * item"). Every field is required — react-hook-form's own `rules` already
 * enforce that — so no `parse` step is needed
 * (`docs/system/guides/web-dialogs.md` §3).
 *
 * A refused SKU (AC-07) is stated **on the SKU field**, naming the value and
 * the rule: `WH-100420 already names "Pallet wrap, 500mm" in this warehouse. A
 * SKU identifies at most one item here.` The endpoint binds the refusal to the
 * field (`api/item-api.ts`) and `translateValidation` below turns the code into
 * that sentence; a refusal no field explains falls to `ItemRefusalAlert`.
 */
export const CreateItemDialog = ({
  items,
  onSave,
}: CreateItemDialogProps): ReactElement => {
  const { t } = useTranslation('item');
  const { t: translate } = useTranslation('validation');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<CreateItemForm>({
    defaultValues: { description: '', sku: '', unitOfMeasure: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  const translateValidation = (
    code: string,
    field: Path<CreateItemForm>,
  ): string => {
    const sku = form.getValues('sku');
    const conflicting = items.find((item) => item.sku === sku);
    // The conflict may name an Item this catalogue read does not hold yet, so
    // the message that cannot name it is its own key rather than an empty
    // interpolation.
    const keysByCode: Record<string, string> = {
      skuTaken:
        conflicting === undefined
          ? 'itemSku.skuTakenUnnamed'
          : 'itemSku.skuTaken',
    };

    return translate(
      keysByCode[code] ?? `${validationSections[field]}.${code}`,
      {
        sku,
        description: conflicting?.description,
      },
    );
  };

  return (
    <FormModalDialog
      title={t('dialogs.create.title')}
      cancelLabel={t('dialogs.create.cancel')}
      submitLabel={t('dialogs.create.submit')}
      form={form}
      translateValidation={translateValidation}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <p className="text-muted">{t('dialogs.create.lede')}</p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.sku)}
        errorMessage={errors.sku?.message}
        label={t('dialogs.create.skuLabel')}
        isDisabled={isSubmitting}
        {...register('sku', { required: translate('itemSku.required') })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.description)}
        errorMessage={errors.description?.message}
        description={t('dialogs.create.descriptionHelp')}
        label={t('dialogs.create.descriptionLabel')}
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
        description={t('dialogs.create.unitOfMeasureHelp')}
        label={t('dialogs.create.unitOfMeasureLabel')}
        isDisabled={isSubmitting}
        {...register('unitOfMeasure', {
          required: translate('itemUnitOfMeasure.required'),
        })}
      />
      <p className="text-sm text-muted">{t('dialogs.create.note')}</p>
      <ItemRefusalAlert code={refusalCode} />
    </FormModalDialog>
  );
};
