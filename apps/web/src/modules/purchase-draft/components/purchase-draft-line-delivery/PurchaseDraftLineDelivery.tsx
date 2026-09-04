import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DeliveryModeField } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/DeliveryModeField';
import { DirectDestinationFields } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/DirectDestinationFields';
import { PurchaseDraftLineDestination } from 'modules/purchase-draft/components/PurchaseDraftLineDestination';
import { Conditional } from 'shared/components/Conditional';

import type {
  DeliveryMode,
  PurchaseDraftLine,
  PurchaseDraftLineUpdate,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftLineDeliveryProps = {
  isDisabled: boolean;
  line: PurchaseDraftLine;
  /** The id of the line's lock strip, which states the one reason writes are refused. */
  reasonId?: string;
  onReviseLine: (input: PurchaseDraftLineUpdate) => void;
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
  line,
  reasonId,
  onReviseLine,
}: PurchaseDraftLineDeliveryProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  // What the member has asked for, which leads the recorded mode for exactly
  // as long as it takes them to name an address. Nothing outside this block
  // reads it (`writing-web-components.md` §9).
  const [chosenMode, setChosenMode] = useState<DeliveryMode>(line.deliveryMode);

  const onChangeMode = (mode: DeliveryMode): void => {
    setChosenMode(mode);
    if (mode === 'via_warehouse') {
      onReviseLine({
        deliveryMode: 'via_warehouse',
        customerDeliveryAddressId: null,
      });
    }
  };

  const onChangeAddress = (customerDeliveryAddressId: string): void => {
    if (customerDeliveryAddressId === '') {
      return;
    }
    onReviseLine({
      deliveryMode: 'direct_to_customer',
      customerDeliveryAddressId,
    });
  };

  const customerDestination =
    'customerDestination' in line ? line.customerDestination : null;

  return (
    <section
      aria-label={t('lineDelivery.heading')}
      className="mt-3 rounded-lg bg-surface-secondary p-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {t('lineDelivery.heading')}
      </p>

      {/* design-handoff.md's first documented mobile difference for this block
          (`jnl1h`): the mode control and the destination stack below `md:` and
          become a row from it up — the same breakpoint the field row above uses. */}
      <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-start md:gap-6">
        <DeliveryModeField
          isDisabled={isDisabled}
          reasonId={reasonId}
          value={chosenMode}
          onChange={onChangeMode}
        />
        <div className="min-w-0 md:flex-1">
          <PurchaseDraftLineDestination line={line} />
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
    </section>
  );
};
