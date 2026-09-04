import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { ArrivalAssignmentRow } from 'modules/purchase-draft/components/purchase-draft-transitions/components/confirm-arrival-dialog/components/ArrivalAssignmentRow';
import { useLinkNaming } from 'modules/purchase-draft/hooks/projections/useLinkNaming';
import { isAssignableLink } from 'modules/purchase-draft/utils/arrival-form';
import { Conditional } from 'shared/components/Conditional';
import { FormTextField } from 'shared/components/FormTextField';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { PurchaseDraftLine } from '@warehouser/contracts/purchase-drafts';
import type { ArrivalForm } from 'modules/purchase-draft/utils/arrival-form';
import type { ReactElement } from 'react';
import type { UseFormReturn } from 'react-hook-form';

export type ArrivalLineFieldsetProps = {
  form: UseFormReturn<ArrivalForm>;
  index: number;
  line: PurchaseDraftLine;
};

const quantityOf = (value: string | undefined): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * One line of an Arrival Confirmation (design-handoff.md `s5EPi`): what
 * arrived, and how much of it each linked Customer Order is assigned
 * (AC-17).
 *
 * The running total below the assignments is a **live region**, so the figures
 * are announced as they change rather than only on submit — the accessibility
 * contract the approved design states for this modal. It reports what the
 * member has entered and nothing more: it never refuses a figure, because the
 * AC-18 bounds are re-checked by the server at the moment the confirmation is
 * recorded, not when the member composed it. Its second sentence names each
 * customer an assignment would fulfil, which is the one consequence of the
 * confirmation that is not visible on the draft itself (AC-17a).
 *
 * Every figure it renders is group-separated (`1 180`, not `1180`): i18next
 * interpolates `{{count}}` as a raw numeral, so the pluralizing count and the
 * `{{formatted}}` string that actually renders are passed side by side, exactly
 * as `modules/item` does (design-handoff.md § Numbers).
 */
export const ArrivalLineFieldset = ({
  form,
  index,
  line,
}: ArrivalLineFieldsetProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const linkNaming = useLinkNaming();
  const { quantity } = useLocaleFormat();
  const {
    formState: { errors, isSubmitting },
    register,
    setValue,
  } = form;
  const values = useWatch({ control: form.control, name: `lines.${index}` });

  const allocationOf = (allocationIndex: number): number =>
    quantityOf(values?.allocations?.[allocationIndex]?.allocatedQuantity);

  const received = quantityOf(values?.receivedQuantity);
  const assigned = (values?.allocations ?? []).reduce(
    (total, allocation) => total + quantityOf(allocation?.allocatedQuantity),
    0,
  );

  // AC-17a — a Customer Order assigned the whole of what it is still waiting
  // for leaves the consolidated demand, which the frame's running total says in
  // its own sentence. Stated only for a link that can still be assigned to, and
  // only once something has actually been assigned.
  const fulfilling = line.links.flatMap((link, allocationIndex) =>
    isAssignableLink(link) &&
    link.current.outstandingQuantity > 0 &&
    allocationOf(allocationIndex) >= link.current.outstandingQuantity
      ? [
          t('transitions.arrival.summaryFulfilled', {
            customer: linkNaming(link),
          }),
        ]
      : [],
  );

  const summary = [
    t('transitions.arrival.summary', {
      assigned: quantity(assigned),
      received: quantity(received),
      unassigned: quantity(received - assigned),
    }),
    ...fulfilling,
  ].join(' ');

  const onCommitAllocation =
    (allocationIndex: number) =>
    (allocatedQuantity: number): void =>
      setValue(
        `lines.${index}.allocations.${allocationIndex}.allocatedQuantity`,
        String(allocatedQuantity),
      );

  return (
    <li className="rounded-xl border border-border-secondary bg-surface p-4">
      <p className="font-semibold">
        {t('transitions.arrival.lineHeading', {
          description: line.itemDescription,
          sku: line.itemSku,
        })}
      </p>
      <p className="text-sm text-muted">
        {t('transitions.arrival.ordered', {
          count: line.orderedQuantity,
          formatted: quantity(line.orderedQuantity),
        })}
      </p>

      <FormTextField
        className="mt-3 md:w-48"
        isRequired
        validationBehavior="aria"
        type="number"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.lines?.[index]?.receivedQuantity)}
        description={t('transitions.arrival.receivedDescription')}
        errorMessage={errors.lines?.[index]?.receivedQuantity?.message}
        label={t('transitions.arrival.receivedLabel', { sku: line.itemSku })}
        {...register(`lines.${index}.receivedQuantity`)}
      />

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        {t('transitions.arrival.assignHeading')}
      </h4>

      <Conditional
        when={line.links.length > 0}
        otherwise={
          <p className="mt-3 text-sm text-muted">
            {t('transitions.arrival.noLinks')}
          </p>
        }
      >
        <ul className="mt-3 flex flex-col gap-2">
          {line.links.map((link, allocationIndex) => (
            <ArrivalAssignmentRow
              key={link.id}
              isSubmitting={isSubmitting}
              link={link}
              onCommit={onCommitAllocation(allocationIndex)}
            />
          ))}
        </ul>
      </Conditional>

      <p
        aria-label={t('transitions.arrival.summaryLabel', {
          sku: line.itemSku,
        })}
        aria-live="polite"
        className="mt-3 text-sm text-default"
        role="status"
      >
        {summary}
      </p>
    </li>
  );
};
