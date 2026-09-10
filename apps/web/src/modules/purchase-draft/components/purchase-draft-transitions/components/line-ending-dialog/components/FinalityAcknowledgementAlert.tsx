import { Alert, Checkbox } from '@heroui/react';
import { useId } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';
import type { Path, UseFormReturn } from 'react-hook-form';

/**
 * The finality acknowledgement's own form fragment (T16, design-handoff.md
 * `S9PcQ`, sad.md §6.2). `FinalityAcknowledgementAlert` is generic over any
 * real form that carries at least this shape, exactly the way `ConditionBlock`
 * and `ConformanceBlock` are generic over their own — the compiler proves the
 * field this writes into is the one the parse step reads.
 */
export type FinalityAcknowledgementForm = {
  finalityAcknowledged: boolean;
};

export type FinalityAcknowledgementAlertProps<
  TForm extends FinalityAcknowledgementForm = FinalityAcknowledgementForm,
> = {
  /** The controlled fragment of a bigger form — writes into `form`'s own
   * `finalityAcknowledged` field and reads nothing else from it. */
  form: UseFormReturn<TForm>;
};

/**
 * Direct-delivery ending only (spec §8 ninth question, sad.md §6.2): a
 * required checkbox stating in full that this ending is final and that the
 * member alone judges when the customer's account is settled. **An
 * interaction, not a state** — nothing here is a column, a timer, a scheduled
 * transition, or a fact inferable later; ticking it is the one deliberate
 * friction this design places on the act, held only in this form session and
 * never itself sent to the server.
 *
 * The checkbox's description is associated through `aria-describedby` so a
 * screen-reader user hears the consequence stated in full **before** ticking,
 * not merely alongside it (design-handoff.md §Accessibility).
 */
export const FinalityAcknowledgementAlert = <
  TForm extends FinalityAcknowledgementForm,
>({
  form,
}: FinalityAcknowledgementAlertProps<TForm>): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const descriptionId = useId();
  const {
    control,
    formState: { isSubmitting },
  } = form;

  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{t('transitions.lineEnding.finality.title')}</Alert.Title>
        <Alert.Description id={descriptionId}>
          {t('transitions.lineEnding.finality.description')}
        </Alert.Description>
        <Controller
          control={control}
          name={'finalityAcknowledged' as Path<TForm>}
          render={({ field }): ReactElement => (
            <Checkbox
              aria-describedby={descriptionId}
              isDisabled={isSubmitting}
              isRequired
              isSelected={Boolean(field.value)}
              onChange={field.onChange}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {t('transitions.lineEnding.finality.checkboxLabel')}
              </Checkbox.Content>
            </Checkbox>
          )}
        />
      </Alert.Content>
    </Alert>
  );
};
