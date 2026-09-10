import { Button } from '@heroui/react';
import { maxProseLength } from '@warehouser/contracts/purchase-drafts';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormSelectField } from 'shared/components/FormSelectField';
import { FormTextAreaField } from 'shared/components/FormTextAreaField';
import { FormTextField } from 'shared/components/FormTextField';
import { XIcon } from 'shared/icons/XIcon';

import type { ConditionBlockForm } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/ConditionBlock';
import type { ReactElement } from 'react';
import type { Control, Path, UseFormRegister } from 'react-hook-form';
import type { SelectOption } from 'shared/components/FormSelectField';

/**
 * One refusal editor row's own narrow contract — the fragment of
 * `ConditionBlockForm` and the catalogue it needs, nothing `ConditionBlock`
 * itself does not already have in hand. `TForm` is `ConditionBlock`'s own
 * generic parameter, carried through unchanged, so `control`/`register` stay
 * bound to the caller's real form type end to end — never a form this row
 * invents or erases.
 */
export type RefusalEditorRowProps<TForm extends ConditionBlockForm> = {
  control: Control<TForm>;
  index: number;
  isSubmitting: boolean;
  quantity: string | undefined;
  reasonLabel: string;
  reasonOptions: SelectOption[];
  register: UseFormRegister<TForm>;
  onRemove: () => void;
};

/**
 * `Inspection/Rejection Row` (design-handoff.md § Component mapping, `H6tv5L`):
 * one refusal's quantity, Reason, remove control and description. Desktop
 * puts quantity + Reason + remove on one row; the description sits below
 * both — the frame's own order, which is also this row's DOM and keyboard
 * order (`app.pen` `W6TARi`/`H0jcSr`; the handoff's front matter treats the
 * frame and its node ids as the contract, never the review-evidence preview).
 *
 * Owned exclusively by `ConditionBlock` — no sibling and no other module
 * renders a refusal row on its own — and kept flat beside
 * `EndingAssignmentRow.tsx` rather than nested under a `ConditionBlock/`
 * directory, matching how this directory already keeps every fieldset-area
 * component it owns (`placing-web-components.md` §"Skip the subgrouping...").
 */
export const RefusalEditorRow = <TForm extends ConditionBlockForm>({
  control,
  index,
  isSubmitting,
  quantity,
  reasonLabel,
  reasonOptions,
  register,
  onRemove,
}: RefusalEditorRowProps<TForm>): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3">
      <div className="flex w-full items-end gap-2.5">
        <FormTextField
          className="w-28 shrink-0"
          isDisabled={isSubmitting}
          label={t('transitions.lineEnding.condition.quantityLabel')}
          type="number"
          validationBehavior="aria"
          {...register(`rejections.${index}.quantity` as Path<TForm>)}
        />
        <Controller
          control={control}
          name={`rejections.${index}.rejectionReasonId` as Path<TForm>}
          render={({ field: reasonField }): ReactElement => (
            <FormSelectField
              className="flex-1"
              isDisabled={isSubmitting}
              label={t('transitions.lineEnding.condition.reasonLabel')}
              name={reasonField.name}
              options={reasonOptions}
              placeholder={t(
                'transitions.lineEnding.condition.reasonPlaceholder',
              )}
              value={reasonField.value as string}
              onBlur={reasonField.onBlur}
              onChange={reasonField.onChange}
            />
          )}
        />
        <Button
          isIconOnly
          aria-label={t('transitions.lineEnding.condition.removeRefusal', {
            quantity: quantity ?? '',
            reason: reasonLabel,
          })}
          className="mb-0 size-9 shrink-0"
          isDisabled={isSubmitting}
          size="sm"
          variant="tertiary"
          onPress={onRemove}
        >
          <XIcon />
        </Button>
      </div>
      <FormTextAreaField
        isDisabled={isSubmitting}
        maxLength={maxProseLength}
        label={t('transitions.lineEnding.condition.descriptionLabel')}
        description={t('transitions.lineEnding.condition.descriptionBound')}
        {...register(`rejections.${index}.description` as Path<TForm>)}
      />
    </div>
  );
};
