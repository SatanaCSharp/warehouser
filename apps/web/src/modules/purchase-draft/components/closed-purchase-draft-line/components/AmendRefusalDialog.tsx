import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormModalDialog } from 'shared/components/FormModalDialog';
import { FormSelectField } from 'shared/components/FormSelectField';
import { FormTextAreaField } from 'shared/components/FormTextAreaField';

import type {
  PurchaseDraftLineRejection,
  RejectionAmend,
  RejectionDisposition,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import type { FormParseResult } from 'shared/utils/form-parse';

export type AmendRefusalDialogProps = {
  rejection: PurchaseDraftLineRejection;
  onSave: (input: RejectionAmend) => Promise<MutationResult>;
};

type AmendRefusalForm = {
  description: string;
  disposition: RejectionDisposition;
};

/**
 * Every Disposition this dialog can offer, in the order the read row's own
 * chip wording already declares (`PurchaseDraftLineRefusalRow`) — `undecided`
 * first because it is the only one a decided Rejection ever drops.
 */
const DISPOSITION_ORDER: RejectionDisposition[] = [
  'undecided',
  'refused_at_delivery',
  'held_for_return',
  'scrapped_on_site',
];

/** The same chip wording the closed line's read row already carries, read
 * from here rather than restated (`closedLine.refusalRow.disposition.*`). */
const DISPOSITION_KEY: Record<RejectionDisposition, string> = {
  undecided: 'closedLine.refusalRow.disposition.undecided',
  refused_at_delivery: 'closedLine.refusalRow.disposition.refused_at_delivery',
  held_for_return: 'closedLine.refusalRow.disposition.held_for_return',
  scrapped_on_site: 'closedLine.refusalRow.disposition.scrapped_on_site',
};

/**
 * `Modal · Amend this refusal` (`iNstk`, design-handoff.md § Component
 * mapping, `W6TARi` cell `Ue4xn`, T18): corrects a recorded Rejection's
 * description and/or Disposition — the only two properties the amendment
 * route accepts (`rejectionAmendSchema`). Its quantity, Reason, Source and
 * line are never offered here (spec.md §6 "Condition immutability").
 *
 * A `FormModalDialog`, never a `ConfirmAlertDialog`
 * (`docs/system/guides/web-dialogs.md` §1): it validates a description and a
 * Disposition. Opened from `ClosedPurchaseDraftLine`'s own `useActionDialog` +
 * `ActionDialogHost` (`docs/system/guides/web-action-dialogs.md`), so this
 * component itself owns neither an `onClose` nor an `isOpen`.
 *
 * **Sends only what changed.** `parse` diffs the form against the Rejection
 * it opened for, so a description-only correction carries no `disposition`
 * key at all (AC-18b) and a Disposition-only correction carries no
 * `description` (AC-18), rather than resending both on every save.
 *
 * **AC-18a — `Undecided` is absent from the list, never shown disabled**,
 * once the Rejection has already been decided: the option is dropped by the
 * options array itself, from the Rejection's own recorded Disposition rather
 * than from what the member has since picked in the trigger.
 */
export const AmendRefusalDialog = ({
  rejection,
  onSave,
}: AmendRefusalDialogProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  // A Rejection carries no description only where the catalogue's Reason
  // does not require one; the field still opens with what is there, and an
  // absent one is blank rather than a literal "null".
  const originalDescription = rejection.description ?? '';
  // Whether prose is required at all is decided by whether the Rejection was
  // recorded with any (review-2026-09-09, finding 4). A description is optional
  // on every Reason the catalogue does not flag, so requiring one here blocked
  // AC-18's own Given — "a recorded Rejection whose disposition is still
  // undecided" — for any refusal recorded without prose: the member had to
  // invent a description to record "held for return".
  //
  // Where prose *was* recorded the rule stands, because
  // `rejectionAmendSchema.description` is optional rather than nullable:
  // "clearing is not offered", so blank after trimming is a refusal, not a
  // clear, and the dialog must not offer a way to send one.
  const isDescriptionRequired = originalDescription !== '';
  const form = useForm<AmendRefusalForm>({
    defaultValues: {
      description: originalDescription,
      disposition: rejection.disposition,
    },
  });
  const {
    control,
    formState: { errors, isSubmitting },
    register,
  } = form;

  const isDecided = rejection.disposition !== 'undecided';
  const dispositionOptions = DISPOSITION_ORDER.filter(
    (disposition) => !isDecided || disposition !== 'undecided',
  ).map((disposition) => ({
    id: disposition,
    label: t(DISPOSITION_KEY[disposition]),
  }));

  const parse = (
    values: AmendRefusalForm,
  ): FormParseResult<AmendRefusalForm, RejectionAmend> => {
    const changes: RejectionAmend = {};
    if (values.description !== originalDescription) {
      changes.description = values.description;
    }
    if (values.disposition !== rejection.disposition) {
      changes.disposition = values.disposition;
    }
    return { data: changes, success: true };
  };

  // Whichever code refuses `disposition` — the wire schema's own
  // `request.invalid` under `details.fields`, or any other — this dialog
  // offers one fix: pick one of the Dispositions it actually lists (AC-19).
  // Only `disposition` reaches a server refusal at all; `description` has no
  // rule beyond "required", which react-hook-form's own `rules` enforce
  // before a request is ever made.
  const translateValidation = (): string =>
    t('closedLine.amendDialog.dispositionUnavailable', {
      dispositions: dispositionOptions.map((option) => option.label).join(', '),
    });

  return (
    <FormModalDialog<AmendRefusalForm, RejectionAmend>
      title={t('closedLine.amendDialog.title')}
      cancelLabel={t('closedLine.amendDialog.cancel')}
      submitLabel={t('closedLine.amendDialog.submit')}
      form={form}
      parse={parse}
      translateValidation={translateValidation}
      onSubmit={onSave}
    >
      <FormTextAreaField
        isRequired={isDescriptionRequired}
        validationBehavior="aria"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.description)}
        errorMessage={errors.description?.message}
        defaultValue={originalDescription}
        label={t('closedLine.amendDialog.descriptionLabel')}
        {...register(
          'description',
          isDescriptionRequired
            ? { required: t('closedLine.amendDialog.descriptionRequired') }
            : {},
        )}
      />
      <Controller
        control={control}
        name="disposition"
        render={({ field }): ReactElement => (
          <FormSelectField
            isDisabled={isSubmitting}
            isInvalid={Boolean(errors.disposition)}
            errorMessage={errors.disposition?.message}
            label={t('closedLine.amendDialog.dispositionLabel')}
            name={field.name}
            options={dispositionOptions}
            value={field.value}
            onBlur={field.onBlur}
            onChange={field.onChange}
          />
        )}
      />
    </FormModalDialog>
  );
};
