import { useTranslation } from 'react-i18next';

import { DriftSignal } from 'modules/purchase-draft/components/DriftSignal';
import { PurchaseDraftLinkIdentity } from 'modules/purchase-draft/components/PurchaseDraftLinkIdentity';
import { PurchaseDraftLinkRow } from 'modules/purchase-draft/components/PurchaseDraftLinkRow';
import { useLinkDriftChips } from 'modules/purchase-draft/hooks/projections/useLinkDriftChips';
import { useLinkNaming } from 'modules/purchase-draft/hooks/projections/useLinkNaming';
import { isAssignableLink } from 'modules/purchase-draft/utils/line-ending-form';
import { Conditional } from 'shared/components/Conditional';
import { FormTextField } from 'shared/components/FormTextField';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type {
  DeliveryMode,
  PurchaseDraftLineLink,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type EndingAssignmentRowProps = {
  /**
   * How the line being ended travels, which decides what a moved Delivery
   * Address on one of its links means (AC-18).
   */
  deliveryMode: DeliveryMode;
  /** Whether the confirmation is in flight, which disables every field in it. */
  isSubmitting: boolean;
  link: PurchaseDraftLineLink;
  onCommit: (allocatedQuantity: number) => void;
};

/** What the em dash of an unassignable row draws in place of a figure (`s5EPi`). */
const NOTHING_ASSIGNABLE = '—';

/**
 * One `Assign to them` row of an Arrival Confirmation line (design-handoff.md
 * `s5EPi`).
 *
 * **A link that can no longer be assigned to is offered no field at all
 * (AC-18).** A Customer Order cancelled or fulfilled since the draft was frozen
 * accepts nothing, and the server refuses the whole confirmation for it — so
 * the approved frame draws that row disabled, carrying the chip that names what
 * moved and the caption saying how much was riding on it. Leaving the field
 * live would let a member compose an assignment the boundary is certain to
 * refuse, and lose every other figure they had typed with it.
 *
 * That is the only bound this row applies. What arrived, what another row was
 * assigned and what the customer is still waiting for stay the server's to
 * re-check at the moment the confirmation is recorded, which is why an
 * assignable row is the same `Ordering/Link Row` (`BSmrU`) the draft and frozen
 * lines render, with no arithmetic of its own.
 */
export const EndingAssignmentRow = ({
  deliveryMode,
  isSubmitting,
  link,
  onCommit,
}: EndingAssignmentRowProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const linkNaming = useLinkNaming();
  const { quantity } = useLocaleFormat();
  const driftChips = useLinkDriftChips();

  const label = t('transitions.lineEnding.assignLabel', {
    customer: linkNaming(link),
  });

  if (!isAssignableLink(link)) {
    // The chip states the comparison the drift helpers already derive — `Cancelled`,
    // `Fulfilled elsewhere` (AC-16). A link the server reported no signal for — an
    // order that was already cancelled when the draft was frozen, so nothing about
    // it moved — still names its state, because the row must say why it is disabled.
    const drifted = driftChips(link, deliveryMode);
    const chips =
      drifted.length > 0
        ? drifted
        : [t(`linkRow.orderState.${link.current.state}`)];

    return (
      <li className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-secondary p-3 opacity-70">
        <div className="min-w-0 flex-1">
          <PurchaseDraftLinkIdentity link={link} />
          <p className="text-sm text-muted">
            {t('transitions.lineEnding.unassignable', {
              count: link.statedQuantity,
              formatted: quantity(link.statedQuantity),
            })}
          </p>
          <span className="mt-1 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <DriftSignal key={chip} label={chip} />
            ))}
          </span>
        </div>
        <FormTextField
          className="w-24 shrink-0 md:w-32"
          defaultValue={NOTHING_ASSIGNABLE}
          isDisabled
          label={label}
        />
      </li>
    );
  }

  return (
    <PurchaseDraftLinkRow
      deliveryMode={deliveryMode}
      isFrozen={false}
      link={link}
      field={{
        commitOn: 'change',
        isDisabled: isSubmitting,
        label,
        value: '',
        onCommit,
      }}
      trailing={
        <Conditional when={link.current.outstandingQuantity > 0}>
          <span className="shrink-0 text-sm text-muted">
            {t('transitions.lineEnding.outstanding', {
              count: link.current.outstandingQuantity,
              formatted: quantity(link.current.outstandingQuantity),
            })}
          </span>
        </Conditional>
      }
    />
  );
};
