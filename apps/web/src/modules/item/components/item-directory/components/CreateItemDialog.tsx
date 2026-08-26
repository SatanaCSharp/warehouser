import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { ItemCreate } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type CreateItemDialogProps = {
  onSave: (input: ItemCreate) => Promise<MutationResult>;
};

type CreateItemForm = {
  description: string;
  sku: string;
  unitOfMeasure: string;
};

/**
 * Records an Item as active with nothing on hand (AC-06). Every field is
 * required — react-hook-form's own `rules` already enforce that — so no
 * `parse` step is needed (`docs/system/guides/web-dialogs.md` §3). A refused
 * SKU (AC-07) stays open and states that nothing has changed.
 */
export const CreateItemDialog = ({
  onSave,
}: CreateItemDialogProps): ReactElement => {
  const { t } = useTranslation('item');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<CreateItemForm>({
    defaultValues: { description: '', sku: '', unitOfMeasure: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  return (
    <FormModalDialog
      title={t('dialogs.create.title')}
      cancelLabel={t('dialogs.create.cancel')}
      submitLabel={t('dialogs.create.submit')}
      form={form}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.sku)}
        errorMessage={errors.sku?.message}
        label={t('dialogs.create.skuLabel')}
        isDisabled={isSubmitting}
        {...register('sku', { required: true })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.description)}
        errorMessage={errors.description?.message}
        label={t('dialogs.create.descriptionLabel')}
        isDisabled={isSubmitting}
        {...register('description', { required: true })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.unitOfMeasure)}
        errorMessage={errors.unitOfMeasure?.message}
        label={t('dialogs.create.unitOfMeasureLabel')}
        isDisabled={isSubmitting}
        {...register('unitOfMeasure', { required: true })}
      />
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t('dialogs.create.refusal')}</Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </FormModalDialog>
  );
};
