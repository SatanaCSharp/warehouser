import { useTranslation } from 'react-i18next';

import { MapPinIcon } from 'shared/icons';

import type {
  DeliveryMode,
  PurchaseDraftLine,
} from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftLineDestinationProps = {
  line: PurchaseDraftLine;
};

/** One destination, drawn identically wherever a line states where its goods go. */
type DestinationStatement = {
  /** Who the goods are for, or `null` where the destination names nobody. */
  subject: string | null;
  /** The address as recorded, or the sentence standing in for one there is not. */
  address: string;
  /** How to reach the place; `null` when none was recorded. */
  accessNotes: string | null;
  /**
   * Whether an address was actually stated. The pin is drawn only when one
   * was, so its **absence** carries the same meaning it carries on the demand
   * surface — and the sentence beside it says the same thing, because meaning
   * never rests on a glyph (design-handoff.md §Icons, §Accessibility).
   */
  hasAddress: boolean;
};

/**
 * Where one Purchase Draft Line's goods travel — the destination half of the
 * `DELIVERY` block (`jnl1h`) and the `Goes to` cell of `Delivery/Dock Line Row`
 * (`DFncO`), so both read the same statement and neither can present a
 * destination the other does not.
 *
 * **Delivery mode is a total `Record<DeliveryMode, DestinationStatement>`**
 * (`writing-web-components.md` §6): adding a third mode to the contract fails
 * to compile here until it is given something to state, which the `if`/`else`
 * this replaces could never guarantee.
 *
 * The two modes state different things for a reason the contract fixes:
 *
 * - **Via Warehouse** — the Warehouse's own address and access notes. The
 *   operator's premises data, read under `PURCHASE_DRAFTS:WATCH` alone and
 *   **never** gated on `CUSTOMERS:WATCH`, because a member who prepares the
 *   dock may hold no Workspace Role at all (AC-10, sad.md §7). A Warehouse
 *   that has recorded no address yet says so rather than leaving a blank —
 *   AC-16a refuses to freeze from that state, but the draft is reachable in
 *   it.
 * - **Direct to Customer** — the customer, the address and the access notes,
 *   or, when `customerDestination` is **absent as a property** on the redacted
 *   arm, one statement saying identity is withheld and nothing else (AC-09a).
 *   No name slot left blank, no address, and no pin, so a redacted line cannot
 *   be read as a direct line with the customer hidden.
 *
 * The address is rendered as text, never as markup and never as a link, and it
 * wraps rather than truncating: an address is long by nature and truncating one
 * makes it ambiguous (spec.md §6.1, design-handoff.md §Accessibility).
 */
export const PurchaseDraftLineDestination = ({
  line,
}: PurchaseDraftLineDestinationProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');

  const warehouseAddress = line.warehouseDestination?.addressText ?? null;
  const customerDestination =
    'customerDestination' in line ? line.customerDestination : null;

  const statement: Record<DeliveryMode, DestinationStatement> = {
    via_warehouse: {
      subject: t('lineDelivery.destination.warehouseSubject'),
      address:
        warehouseAddress ?? t('lineDelivery.destination.noWarehouseAddress'),
      accessNotes: line.warehouseDestination?.accessNotes ?? null,
      hasAddress: warehouseAddress !== null,
    },
    direct_to_customer: {
      subject: customerDestination?.customerName ?? null,
      address:
        customerDestination?.addressText ??
        t('lineDelivery.destination.withheld'),
      accessNotes: customerDestination?.accessNotes ?? null,
      hasAddress: customerDestination !== null,
    },
  };

  const { accessNotes, address, hasAddress, subject } =
    statement[line.deliveryMode];

  return (
    <div className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className={`mt-0.5 shrink-0 text-muted ${hasAddress ? '' : 'invisible'}`}
      >
        <MapPinIcon />
      </span>
      <span className="min-w-0">
        <span className="block break-words font-medium text-foreground empty:hidden">
          {subject}
        </span>
        <span
          className={`block whitespace-pre-line break-words ${
            hasAddress ? 'text-foreground' : 'text-muted'
          }`}
        >
          {address}
        </span>
        <span className="block text-sm text-muted empty:hidden">
          {accessNotes}
        </span>
      </span>
    </div>
  );
};
