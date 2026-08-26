import { Alert } from '@heroui/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormTextField } from 'shared/components/FormTextField';

import type { PurchaseDraftClosure } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type ClosePurchaseDraftDialogProps = {
  onSubmit: (input: PurchaseDraftClosure) => Promise<MutationResult>;
};

/**
 * Closes a frozen Purchase Draft the supplier cannot fulfil, with the reason
 * that closed it (AC-21). Something is filled in, so it is a `FormModalDialog`
 * rather than a confirmation (`docs/system/guides/web-dialogs.md` §1).
 *
 * The reason is never optional: react-hook-form's own `required` rule blocks
 * the request before it is made, which is why no `parse` step is declared —
 * the only rule is which field is required, and that rule already has an owner
 * (web-dialogs.md §3). What committed is stated back by the success toast the
 * registry entry names, not by this dialog, which has closed by then.
 */
export const ClosePurchaseDraftDialog = ({
  onSubmit,
}: ClosePurchaseDraftDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const [refusalCode, setRefusalCode] = useState<string>();
  const form = useForm<PurchaseDraftClosure>({
    defaultValues: { closureReason: '' },
  });
  const {
    formState: { errors, isSubmitting },
    register,
  } = form;

  return (
    <FormModalDialog
      title={t('transitions.close.title')}
      cancelLabel={t('transitions.close.cancel')}
      submitLabel={t('transitions.close.submit')}
      submitVariant="danger"
      form={form}
      onRefusal={setRefusalCode}
      onSubmit={onSubmit}
    >
      <p>{t('transitions.close.body')}</p>
      <FormTextField
        autoFocus
        isRequired
        validationBehavior="aria"
        isInvalid={Boolean(errors.closureReason)}
        errorMessage={errors.closureReason?.message}
        label={t('transitions.close.reasonLabel')}
        isDisabled={isSubmitting}
        {...register('closureReason', {
          required: t('transitions.close.reasonRequired'),
        })}
      />
      <Conditional when={refusalCode !== undefined}>
        <Alert role="alert" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              {t('transitions.close.refusal')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
    </FormModalDialog>
  );
};
