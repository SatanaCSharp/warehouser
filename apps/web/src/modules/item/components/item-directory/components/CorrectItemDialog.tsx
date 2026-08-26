import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { Item, ItemUpdate } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { FormParseResult } from 'shared/utils/form-parse';

type CorrectItemDialogProps = {
  item: Item;
  onSave: (input: ItemUpdate) => Promise<MutationResult>;
};

type CorrectItemForm = { description: string; unitOfMeasure: string };

/**
 * Corrects an Item's Description or Unit of Measure independently (AC-06b):
 * changing one leaves the other untouched, so `parse` submits only the field
 * that changed rather than resending both. A SKU-fixed style refusal (AC-06c)
 * stays open and states that nothing has changed.
 */
export const CorrectItemDialog = ({
  item,
  onSave,
}: CorrectItemDialogProps): ReactElement => {
  const { t } = useTranslation('item');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<CorrectItemForm>({
    defaultValues: {
      description: item.description,
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
    if (values.description !== item.description) {
      changes.description = values.description;
    }
    if (values.unitOfMeasure !== item.unitOfMeasure) {
      changes.unitOfMeasure = values.unitOfMeasure;
    }
    return { data: changes, success: true };
  };

  return (
    <FormModalDialog
      title={t('dialogs.correct.title')}
      cancelLabel={t('dialogs.correct.cancel')}
      submitLabel={t('dialogs.correct.submit')}
      form={form}
      parse={parse}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.description)}
        errorMessage={errors.description?.message}
        defaultValue={item.description}
        label={t('dialogs.correct.descriptionLabel')}
        isDisabled={isSubmitting}
        {...register('description', { required: true })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.unitOfMeasure)}
        errorMessage={errors.unitOfMeasure?.message}
        defaultValue={item.unitOfMeasure}
        label={t('dialogs.correct.unitOfMeasureLabel')}
        isDisabled={isSubmitting}
        {...register('unitOfMeasure', { required: true })}
      />
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t('dialogs.correct.refusal')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </FormModalDialog>
  );
};
