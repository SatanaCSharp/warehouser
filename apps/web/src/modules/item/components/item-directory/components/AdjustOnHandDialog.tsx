import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { Item, OnHandAdjustmentCreate } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

type AdjustOnHandDialogProps = {
  item: Item;
  onSave: (input: OnHandAdjustmentCreate) => Promise<MutationResult>;
};

type AdjustOnHandForm = { countedQuantity: number; reason: string };

/**
 * Sets an Item's On-hand Quantity to a counted figure with a stated reason
 * (AC-08). The server alone enforces the whole-number/non-negative range
 * (AC-09) — no Zod or hand-rolled pre-check on `countedQuantity` duplicates
 * it here. The reason is never optional (AC-09a): react-hook-form's own
 * `required` rule blocks the request before it is made, and a server denial
 * stays open and states that nothing has changed.
 */
export const AdjustOnHandDialog = ({
  item,
  onSave,
}: AdjustOnHandDialogProps): ReactElement => {
  const { t } = useTranslation('item');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<AdjustOnHandForm>({
    defaultValues: { countedQuantity: item.onHandQuantity, reason: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  return (
    <FormModalDialog
      title={t('dialogs.adjustOnHand.title')}
      cancelLabel={t('dialogs.adjustOnHand.cancel')}
      submitLabel={t('dialogs.adjustOnHand.submit')}
      form={form}
      onRefusal={setRefusalCode}
      onSubmit={onSave}
    >
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        type="number"
        isInvalid={Boolean(errors.countedQuantity)}
        errorMessage={errors.countedQuantity?.message}
        defaultValue={String(item.onHandQuantity)}
        label={t('dialogs.adjustOnHand.quantityLabel')}
        isDisabled={isSubmitting}
        {...register('countedQuantity', {
          required: true,
          valueAsNumber: true,
        })}
      />
      <FormTextField
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.reason)}
        errorMessage={errors.reason?.message}
        label={t('dialogs.adjustOnHand.reasonLabel')}
        isDisabled={isSubmitting}
        {...register('reason', {
          required: t('dialogs.adjustOnHand.reasonRequired'),
        })}
      />
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t('dialogs.adjustOnHand.refusal')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </FormModalDialog>
  );
};
