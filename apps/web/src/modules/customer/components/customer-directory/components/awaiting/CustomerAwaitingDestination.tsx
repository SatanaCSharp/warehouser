import type { CustomerOrderDestination } from '@warehouser/contracts/customers';
import { destinationReason } from 'modules/customer/utils/awaiting-destination';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPinIcon } from 'shared/icons';

export type CustomerAwaitingDestinationProps = {
  destination: CustomerOrderDestination;
};

/**
 * The `Going to` cell of `Delivery/Awaiting Row` (`zw3n9`) and the same block
 * on `Delivery/Awaiting Card Mobile` (`XXFuv`): the address the goods are
 * going to, and **why it is that address** — the Customer's Main one, one
 * stated on this order instead, or one that has since been made Inactive while
 * the order keeps naming it (AC-06a).
 *
 * The address is rendered as text, never as markup and never as a link, for
 * the same reason `CustomerAddressRow` renders it as text (spec.md §6.1).
 *
 * The pin is decorative here and carries `aria-hidden`; the reason line is
 * what a screen reader announces, so the meaning never depends on the glyph
 * (design-handoff.md §Accessibility).
 *
 * It is its own component rather than an expression in a cell, because it
 * reads translations and a React Aria row renderer may call no hook
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const CustomerAwaitingDestination = ({
  destination,
}: CustomerAwaitingDestinationProps): ReactElement => {
  const { t } = useTranslation('customer');

  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-muted">
        <MapPinIcon />
      </span>
      <span className="min-w-0">
        <span className="block whitespace-pre-line break-words text-foreground">
          {destination.addressText}
        </span>
        <span className="block text-sm text-muted">
          {t(`detail.awaiting.reason.${destinationReason(destination)}`)}
        </span>
      </span>
    </div>
  );
};
