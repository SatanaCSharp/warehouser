import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { PurchaseDraftLinkRow } from 'modules/purchase-draft/components/PurchaseDraftLinkRow';
import { Conditional } from 'shared/components/Conditional';
import { FormTextField } from 'shared/components/FormTextField';

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
 * recorded, not when the member composed it.
 *
 * Each assignment reuses `Ordering/Link Row` (`BSmrU`) in its third job — the
 * same row the draft and frozen lines render, with the field label and the
 * trailing control this job needs.
 */
export const ArrivalLineFieldset = ({
  form,
  index,
  line,
}: ArrivalLineFieldsetProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const {
    formState: { errors, isSubmitting },
    register,
    setValue,
  } = form;
  const values = useWatch({ control: form.control, name: `lines.${index}` });

  const received = quantityOf(values?.receivedQuantity);
  const assigned = (values?.allocations ?? []).reduce(
    (total, allocation) => total + quantityOf(allocation?.allocatedQuantity),
    0,
  );

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
        {t('transitions.arrival.ordered', { count: line.orderedQuantity })}
      </p>

      <FormTextField
        className="mt-3 md:w-48"
        isRequired
        validationBehavior="aria"
        type="number"
        isDisabled={isSubmitting}
        isInvalid={Boolean(errors.lines?.[index]?.receivedQuantity)}
        errorMessage={errors.lines?.[index]?.receivedQuantity?.message}
        label={t('transitions.arrival.receivedLabel', { sku: line.itemSku })}
        {...register(`lines.${index}.receivedQuantity`)}
      />

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
            <PurchaseDraftLinkRow
              key={link.id}
              link={link}
              field={{
                commitOn: 'change',
                isDisabled: isSubmitting,
                label: t('transitions.arrival.assignLabel', {
                  customer: link.customerName,
                }),
                value: '',
                onCommit: onCommitAllocation(allocationIndex),
              }}
              trailing={
                <span className="shrink-0 text-sm text-muted">
                  {t('transitions.arrival.outstanding', {
                    count: link.current.outstandingQuantity,
                  })}
                </span>
              }
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
        {t('transitions.arrival.summary', {
          assigned,
          received,
          unassigned: received - assigned,
        })}
      </p>
    </li>
  );
};
