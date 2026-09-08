import { Button, Chip } from '@heroui/react';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useFieldArray, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { RefusalEditorRow } from 'modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/components/RefusalEditorRow';
import { useRejectionReasons } from 'modules/purchase-draft/hooks/queries/useRejectionReasons';
import { quantityOf } from 'modules/purchase-draft/utils/line-ending-form';
import { Conditional } from 'shared/components/Conditional';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { PackageXIcon } from 'shared/icons/PackageXIcon';

import type { RejectionRow } from 'modules/purchase-draft/utils/line-ending-form';
import type { ReactElement } from 'react';
import type { ArrayPath, UseFormReturn } from 'react-hook-form';

/**
 * The condition block's own form fragment (T15, design-handoff.md `W6TARi`
 * cell `H0jcSr`, mobile `kejd2`). `ConditionBlock` is generic over any real
 * form that carries at least this shape (`TForm extends ConditionBlockForm`),
 * so `LineEndingFieldset` hands over its own real `LineEndingForm` unchanged
 * and unerased — the compiler, not a comment, is what proves the field array
 * this block writes into is the one the parse functions read
 * (2026-09-08 review: a whole-object `as unknown as` cast here previously let
 * the two drift silently).
 */
export type ConditionBlockForm = {
  rejections: RejectionRow[];
};

export type ConditionBlockProps<
  TForm extends ConditionBlockForm = ConditionBlockForm,
> = {
  className?: string;
  /**
   * `ConditionBlock` is a controlled fragment of a bigger form — it writes
   * into `form`'s own `rejections` field array and reads nothing else from
   * it. `LineEndingFieldset` hands over its real `LineEndingForm` as `TForm`;
   * a caller exercising this block alone (this component's own spec) may use
   * `ConditionBlockForm` itself.
   */
  form: UseFormReturn<TForm>;
  itemSku: string;
  /** Which of the two acts is being recorded — decides the source chip, the
   * presented figure's label, and the Rejection Source every refusal on this
   * line is recorded with (AC-24). */
  kind: 'arrival' | 'directDelivery';
  /** What the line was originally ordered for — the first of the summary's
   * four figures (design-handoff.md § Component mapping, `bllT3`/`M9G5z`). */
  ordered: number;
  /** What the line's ending states arrived or was delivered — never refused
   * by this block; the accepted figure is derived from it, live. */
  presented: number;
};

/** The Rejection Source chip's wording, derived from the line's Delivery Mode
 * and never itself a field (AC-24, AC-25). */
const SOURCE_KEY_BY_KIND: Record<ConditionBlockProps['kind'], string> = {
  arrival: 'sourceInspected',
  directDelivery: 'sourceCustomerReported',
};

/** Which figure label the second summary cell reads — "PRESENTED" for what
 * arrived at the dock, "DELIVERED" for what the customer received
 * (design-handoff.md § Component mapping). */
const PRESENTED_FIGURE_KEY_BY_KIND: Record<
  ConditionBlockProps['kind'],
  string
> = {
  arrival: 'presented',
  directDelivery: 'delivered',
};

/** One of the condition summary's four cells (`bllT3`/`M9G5z`): the value
 * first in the DOM so a live region announces it immediately before the
 * figure it names, then the label — visually reversed with `flex-col-reverse`
 * so the label still reads above the value, exactly as the approved frame
 * draws it. Private to this file: no sibling renders a summary figure on its
 * own. */
const SummaryFigure = ({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: 'danger';
  value: string;
}): ReactElement => (
  <div className="flex flex-col-reverse gap-[3px]">
    <span
      className={`text-xl font-semibold tracking-tight ${
        tone === 'danger' ? 'text-danger' : 'text-foreground'
      }`}
    >
      {value}
    </span>
    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
      {label}
    </span>
  </div>
);

/**
 * The always-present condition block (AC-01, AC-01a, AC-01b, AC-05, AC-08,
 * AC-13, AC-24): the head row (micro-label, the Rejection Source chip, and the
 * `Refuse some of this` control), the four-figure condition summary live
 * region, the refusal editor rows it opens, and the explanatory footnote.
 *
 * **Never collapsed, never optional.** It renders on every ending for a line
 * where something was received, opening at `presented · 0 refused · presented
 * accepted` — refusing nothing is a statement the member makes, not a step
 * they skip (design-handoff.md § States and interactions). The absence of the
 * block on a line where nothing was received is `LineEndingFieldset`'s own
 * `Conditional`, not this component's — a condition block is either fully
 * present or not rendered at all.
 *
 * **Accepted is derived, never typed.** It is `presented` minus the sum of
 * every refusal row's quantity, recomputed on every keystroke through
 * `useWatch`, so a refusal can never make a member retype it.
 */
export const ConditionBlock = <TForm extends ConditionBlockForm>({
  className,
  form,
  itemSku,
  kind,
  presented,
  ordered,
}: ConditionBlockProps<TForm>): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { quantity } = useLocaleFormat();
  const {
    control,
    formState: { isSubmitting },
    register,
  } = form;
  // `TForm` only *satisfies* `ConditionBlockForm`'s constraint — it does not
  // structurally equal it — so RHF's own `ArrayPath<TForm>`/`FieldArray<TForm, …>`
  // cannot narrow to the literal `'rejections'` key a bounded generic guarantees.
  // The cast below is scoped to that one literal path, proven by the generic
  // constraint itself: it is not the whole-object `as unknown as` erasure this
  // replaced, which hid the exact field the 2026-09-08 review's mutation found.
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'rejections' as ArrayPath<TForm>,
  });
  const values = useWatch({ control });
  // The catalogue is read here, by the component that uses it, rather than
  // taken as a prop — so the production read is the only shape there is, and a
  // spec exercises it by seeding the same cache the component subscribes to
  // (`writing-web-components.md` §4, `placing-web-hooks.md` §4).
  const catalogue = useRejectionReasons();

  const reasonOptions = catalogue.map((reason) => ({
    id: reason.id,
    label: reason.label,
  }));

  const refused = (values.rejections ?? []).reduce(
    (total, rejection) => total + quantityOf(rejection?.quantity),
    0,
  );
  const accepted = presented - refused;

  const onPressRefuse = (): void => {
    const blank: RejectionRow = {
      description: '',
      quantity: '',
      rejectionReasonId: '',
    };
    append(blank as Parameters<typeof append>[0]);
  };

  const onPressRemove = (index: number) => (): void => {
    remove(index);
  };

  const rows = fields.map((field, index) => {
    const row = values.rejections?.[index];
    const reasonLabel =
      reasonOptions.find((option) => option.id === row?.rejectionReasonId)
        ?.label ?? '';

    return (
      <RefusalEditorRow
        key={field.id}
        control={control}
        index={index}
        isSubmitting={isSubmitting}
        quantity={row?.quantity}
        reasonLabel={reasonLabel}
        reasonOptions={reasonOptions}
        register={register}
        onRemove={onPressRemove(index)}
      />
    );
  });

  return (
    <div
      className={`flex w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 ${className ?? ''}`}
    >
      <div className="flex w-full flex-wrap items-center gap-2.5">
        <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {t(`transitions.lineEnding.condition.heading.${kind}`)}
        </p>
        <Chip size="sm" variant="soft">
          {t(`transitions.lineEnding.condition.${SOURCE_KEY_BY_KIND[kind]}`)}
        </Chip>
        <span className="flex-1" />
        <WarehousePermissionGate permission={PermissionId.REJECTIONS_CREATE}>
          <Button size="sm" variant="tertiary" onPress={onPressRefuse}>
            <PackageXIcon />
            {t('transitions.lineEnding.condition.refuseButton')}
          </Button>
        </WarehousePermissionGate>
      </div>

      {/* `bllT3`/`M9G5z` — one row of four on desktop, 2×2 on mobile, same
          order and labels at both widths. */}
      <div
        aria-label={t('transitions.lineEnding.condition.summaryLabel', {
          sku: itemSku,
        })}
        aria-live="polite"
        className="grid w-full grid-cols-2 gap-3 rounded-2xl border border-border bg-surface-secondary px-4 py-3 md:grid-cols-4"
        role="status"
      >
        <SummaryFigure
          label={t('transitions.lineEnding.condition.summaryFigures.ordered')}
          value={quantity(ordered)}
        />
        <SummaryFigure
          label={t(
            `transitions.lineEnding.condition.summaryFigures.${PRESENTED_FIGURE_KEY_BY_KIND[kind]}`,
          )}
          value={quantity(presented)}
        />
        <SummaryFigure
          label={t('transitions.lineEnding.condition.summaryFigures.refused')}
          tone="danger"
          value={quantity(refused)}
        />
        <SummaryFigure
          label={t('transitions.lineEnding.condition.summaryFigures.accepted')}
          value={quantity(accepted)}
        />
      </div>

      <Conditional when={fields.length > 0}>
        <div className="flex w-full flex-col gap-2.5">{rows}</div>
      </Conditional>

      {/* The explanatory footnote (`ending-dialogs-desktop-v1.html:263,349`
          — review evidence for the copy only, not for placement or DOM
          order): why accepted is never typed, and why every refusal on this
          line reads as it does (AC-01, AC-24). Always present, like the rest
          of the block. */}
      <p className="text-xs leading-relaxed text-muted">
        {t(`transitions.lineEnding.condition.footnote.${kind}`)}
      </p>
    </div>
  );
};
