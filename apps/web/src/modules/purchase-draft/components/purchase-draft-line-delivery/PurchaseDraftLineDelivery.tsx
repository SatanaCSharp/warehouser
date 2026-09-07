import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DeliveryModeField } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/DeliveryModeField';
import { DirectDestinationFields } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/direct-destination-fields/DirectDestinationFields';
import { PurchaseDraftLineDeliveryRefusalAlert } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/PurchaseDraftLineDeliveryRefusalAlert';
import { PurchaseDraftLineDestination } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/PurchaseDraftLineDestination';
import { disagreeingDeliveryLinks } from 'modules/purchase-draft/utils/delivery-disagreement';
import { mutationOutcome } from 'shared/api/client/mutation-outcome';
import { Conditional } from 'shared/components/Conditional';

import type {
  DeliveryMode,
  PurchaseDraftLine,
  PurchaseDraftLineUpdate,
} from '@warehouser/contracts/purchase-drafts';
import type { DisagreeingDeliveryLink } from 'modules/purchase-draft/utils/delivery-disagreement';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type PurchaseDraftLineDeliveryProps = {
  isDisabled: boolean;
  /**
   * Whether the draft has been frozen, which decides the tense the destination
   * speaks in — `Goes to` while it can still be written, `Went to` once it
   * records what the supplier was told. It is **not** `isDisabled`: an
   * archived Warehouse or a missing Permission stops the writes without
   * putting the line in the past.
   */
  isFrozen: boolean;
  line: PurchaseDraftLine;
  /** The id of the line's lock strip, which states the one reason writes are refused. */
  reasonId?: string;
  onReviseLine: (input: PurchaseDraftLineUpdate) => Promise<MutationResult>;
};

/**
 * The `DELIVERY` block of `Delivery/Draft Line` (`jnl1h`) — how this line's
 * goods travel and where to, serving the editable **and** the frozen line, as
 * the rest of the line does (AC-13, AC-17).
 *
 * **The two writes are not symmetric, and that asymmetry is the contract's.**
 * `purchaseDraftLineUpdateSchema` refuses `direct_to_customer` without a
 * `customerDeliveryAddressId` and refuses `via_warehouse` *with* one, because
 * a Via Warehouse line's destination *is* the Warehouse's own address and
 * there is no identifier to keep (`chk_purchase_draft_lines_delivery_mode_address`,
 * AC-13). So coming back to the dock is one submittable revision that clears
 * the address with the mode, while going direct is a mode the member has
 * chosen and an address they have not yet named — which is why the chosen mode
 * is transient state here and the write happens when the destination is
 * stated.
 *
 * Frozen or archived, the whole block is HeroUI's disabled treatment and the
 * reason is the line's own lock strip, stated once rather than repeated per
 * field (AC-17, AC-23, design-handoff.md §Accessibility).
 */
export const PurchaseDraftLineDelivery = ({
  isDisabled,
  isFrozen,
  line,
  reasonId,
  onReviseLine,
}: PurchaseDraftLineDeliveryProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  // What the member has asked for, which leads the recorded mode for exactly
  // as long as it takes them to name an address. Nothing outside this block
  // reads it (`writing-web-components.md` §9).
  const [chosenMode, setChosenMode] = useState<DeliveryMode>(line.deliveryMode);
  // AC-15a — every disagreeing link a revision was refused for, or nothing
  // while none has been reported. Cleared on a fresh attempt so a since-fixed
  // revision does not keep showing a stale refusal.
  const [disagreeingLinks, setDisagreeingLinks] =
    useState<DisagreeingDeliveryLink[]>();

  const applyOutcome = (result: MutationResult): void => {
    const outcome = mutationOutcome(result);
    setDisagreeingLinks(disagreeingDeliveryLinks(outcome.details));
  };

  const onChangeMode = (mode: DeliveryMode): void => {
    setChosenMode(mode);
    if (mode === 'via_warehouse') {
      void onReviseLine({
        deliveryMode: 'via_warehouse',
        customerDeliveryAddressId: null,
      }).then(applyOutcome);
    }
  };

  const onChangeAddress = (customerDeliveryAddressId: string): void => {
    if (customerDeliveryAddressId === '') {
      return;
    }
    void onReviseLine({
      deliveryMode: 'direct_to_customer',
      customerDeliveryAddressId,
    }).then(applyOutcome);
  };

  const customerDestination =
    'customerDestination' in line ? line.customerDestination : null;

  return (
    <section
      aria-label={t('lineDelivery.heading')}
      className="mt-3 rounded-lg border border-border bg-surface-secondary p-3.5"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t('lineDelivery.heading')}
      </p>

      {/* design-handoff.md's first documented mobile difference for this block
          (`jnl1h`): the mode control and the destination stack below `md:` and
          become a row from it up — the same breakpoint the field row above uses. */}
      <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-start">
        <DeliveryModeField
          isDisabled={isDisabled}
          reasonId={reasonId}
          value={chosenMode}
          onChange={onChangeMode}
        />
        <div className="min-w-0 md:flex-1">
          <PurchaseDraftLineDestination
            aria-describedby={reasonId}
            isFrozen={isFrozen}
            line={line}
          />
        </div>
      </div>

      {/* The pickers appear only while the member is composing a direct line
          that can still be written. A frozen or archived line states its
          destination and offers no way to restate it (AC-17, AC-23). */}
      <Conditional when={chosenMode === 'direct_to_customer' && !isDisabled}>
        <DirectDestinationFields
          customerDeliveryAddressId={
            customerDestination?.customerDeliveryAddressId ?? ''
          }
          customerId={customerDestination?.customerId ?? ''}
          isDisabled={isDisabled}
          onChangeAddress={onChangeAddress}
        />
      </Conditional>

      <PurchaseDraftLineDeliveryRefusalAlert
        disagreeingLinks={disagreeingLinks}
        line={line}
      />
    </section>
  );
};
