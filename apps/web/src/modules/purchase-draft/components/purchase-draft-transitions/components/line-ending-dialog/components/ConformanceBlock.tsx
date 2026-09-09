import { Radio, RadioGroup } from '@heroui/react';
import { maxProseLength } from '@warehouser/contracts/purchase-drafts';
import { useId } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { usePackagingTypes } from 'modules/purchase-draft/hooks/queries/usePackagingTypes';
import { Conditional } from 'shared/components/Conditional';
import { FormTextAreaField } from 'shared/components/FormTextAreaField';
import { LockIcon } from 'shared/icons/LockIcon';

import type { ConformanceVerdict } from 'modules/purchase-draft/utils/line-ending-form';
import type { ReactElement } from 'react';
import type { Path, UseFormReturn } from 'react-hook-form';

/**
 * The conformance block's own form fragment (T16, design-handoff.md `W6TARi`
 * cells `upEnS`/`lBacq`/`B00NU`, mobile `kejd2`). `ConformanceBlock` is
 * generic over any real form that carries at least this shape
 * (`TForm extends ConformanceBlockForm`), exactly the way `ConditionBlock` is
 * generic over `ConditionBlockForm` — the compiler, not a comment, proves the
 * field this block writes into is the one the parse functions read
 * (2026-09-08 review pattern).
 */
export type ConformanceBlockForm = {
  preReceiptConformance: { note: string; verdict: ConformanceVerdict };
};

export type ConformanceBlockProps<
  TForm extends ConformanceBlockForm = ConformanceBlockForm,
> = {
  className?: string;
  /** The controlled fragment of a bigger form — writes into `form`'s own
   * `preReceiptConformance` field and reads nothing else from it. */
  form: UseFormReturn<TForm>;
  /** What the line was frozen carrying (AC-15a) — `null` when the line was
   * frozen with none, which is what makes `Met`/`Not met` illegal answers for
   * it (AC-17). */
  packagingTypeId: string | null;
  valueAddingNote: string | null;
};

/** The three legal answers, in the order both frames draw them. `''` — the
 * un-defaulted opening state — is not one of them: it is never offered as a
 * `Radio`, only ever the value nothing has been chosen from yet. */
const VERDICTS = [
  'met',
  'not_met',
  'not_applicable',
] as const satisfies readonly ConformanceVerdict[];

type Verdict = (typeof VERDICTS)[number];

/**
 * Which option a line cannot take (AC-17, AC-17a), as a total lookup rather
 * than an `if`/`else if` chain: a line frozen carrying either instruction can
 * only be judged honoured or not honoured, and a line frozen with neither can
 * only record that the judgement does not apply.
 */
const withheldByInstructed = (
  instructed: boolean,
): Record<Verdict, boolean> => ({
  met: !instructed,
  not_met: !instructed,
  not_applicable: instructed,
});

/**
 * The conformance block: the frozen-instruction read-out (`lock` icon,
 * Packaging Type, Value-adding Note), a real `radiogroup` of Met / Not met /
 * Not applicable with **no default selection**, then the note field shown
 * only under `Not met` (AC-15, AC-15a).
 *
 * **The option a line cannot take withholds itself rather than being offered
 * and refused server-side** (AC-17, AC-17a): dimmed-and-disabled, its reason
 * stated once for the whole group in the footnote below the note field, never
 * repeated per option.
 */
export const ConformanceBlock = <TForm extends ConformanceBlockForm>({
  className,
  form,
  packagingTypeId,
  valueAddingNote,
}: ConformanceBlockProps<TForm>): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const headingId = useId();
  const {
    control,
    formState: { isSubmitting },
    register,
  } = form;
  // The catalogue is read here, by the component that uses it, rather than
  // taken as a prop — so the production read is the only shape there is, and a
  // spec exercises it by seeding the same cache the component subscribes to
  // (`writing-web-components.md` §4, `placing-web-hooks.md` §4).
  const catalogue = usePackagingTypes();
  // The raw id is a deliberate fallback, not the intended reading: it covers
  // only the tick before the catalogue resolves (or the rare id the catalogue
  // no longer lists), never the steady state. `ConformanceBlock.spec.tsx`
  // pins the resolved label — both through this prop and through the live
  // query — precisely so this line can never regress to always falling
  // through to the id.
  const packagingTypeLabel =
    catalogue.find((type) => type.id === packagingTypeId)?.label ??
    packagingTypeId;
  const verdict = useWatch({
    control,
    name: 'preReceiptConformance.verdict' as Path<TForm>,
  }) as ConformanceVerdict | undefined;

  const instructed = Boolean(packagingTypeId) || Boolean(valueAddingNote);
  const withheld = withheldByInstructed(instructed);
  const withheldReason = instructed
    ? t('transitions.lineEnding.conformance.notApplicableWithheld')
    : t('transitions.lineEnding.conformance.judgementWithheld');

  return (
    <div
      className={`flex w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 ${className ?? ''}`}
    >
      {/* The heading labels this whole block — the frozen instruction panel as
          well as the verdicts — so it stays where the frame draws it and the
          group points at it with `aria-labelledby`. Putting it inside the group
          as HeroUI's `<Label>` would be the ordinary shape
          (`radio-group.mdx` § Anatomy), but it would also move the heading
          below the instruction panel. What the review actually found was the
          duplication: the same sentence rendered here and copied again into the
          group's `aria-label`, so it entered the accessibility tree twice and
          React Aria's own association was bypassed
          (`heroui-design-principles.md` §2). */}
      <p
        className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted"
        id={headingId}
      >
        {t('transitions.lineEnding.conformance.heading')}
      </p>

      <Conditional when={instructed}>
        <div className="flex w-full items-start gap-2.5 rounded-2xl bg-surface-secondary px-3 py-2.5">
          <span className="mt-0.5 shrink-0 text-muted">
            <LockIcon />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Conditional when={packagingTypeId}>
              <p className="text-[13px] font-semibold text-foreground">
                {t('transitions.lineEnding.conformance.packagingType', {
                  packagingType: packagingTypeLabel,
                })}
              </p>
            </Conditional>
            <Conditional when={valueAddingNote}>
              <p className="text-xs leading-relaxed text-muted">
                {t('transitions.lineEnding.conformance.valueAddingNote', {
                  note: valueAddingNote,
                })}
              </p>
            </Conditional>
          </div>
        </div>
      </Conditional>

      <Controller
        control={control}
        name={'preReceiptConformance.verdict' as Path<TForm>}
        render={({ field }): ReactElement => (
          <RadioGroup
            aria-labelledby={headingId}
            className="flex w-full flex-col gap-2.5 md:flex-row md:flex-wrap md:items-center md:gap-7"
            isDisabled={isSubmitting}
            value={field.value as string}
            onChange={field.onChange}
          >
            {VERDICTS.map((verdict) => (
              <Radio
                key={verdict}
                isDisabled={isSubmitting || withheld[verdict]}
                value={verdict}
              >
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  {t(`transitions.lineEnding.conformance.options.${verdict}`)}
                </Radio.Content>
              </Radio>
            ))}
          </RadioGroup>
        )}
      />

      <Conditional when={verdict === 'not_met'}>
        <FormTextAreaField
          isDisabled={isSubmitting}
          maxLength={maxProseLength}
          label={t('transitions.lineEnding.conformance.noteLabel')}
          description={t('transitions.lineEnding.conformance.noteDescription')}
          {...register('preReceiptConformance.note' as Path<TForm>)}
        />
      </Conditional>

      <p className="text-xs leading-relaxed text-muted">{withheldReason}</p>
    </div>
  );
};
