import type {
  DeliveryMode,
  PurchaseDraftLine,
} from '@warehouser/contracts/purchase-drafts';
import { useTranslation } from 'react-i18next';

/** One destination, stated identically wherever a line says where its goods go. */
export type DestinationStatement = {
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
 * Where one Purchase Draft Line's goods travel, resolved once for the two
 * surfaces that state it: the `Goes to` / `Went to` field of the `DELIVERY`
 * block (`jnl1h`) and the `DESTINATION` cell of `Delivery/Dock Line Row`
 * (`DFncO`). Both read this, so neither can present a destination the other
 * does not.
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
 * It is a hook rather than a `utils/` helper because every sentence it may
 * stand in for is translated copy (`placing-web-hooks.md`).
 */
export const useDestinationStatement = (): ((
  line: PurchaseDraftLine,
) => DestinationStatement) => {
  const { t } = useTranslation('purchase-draft');

  return (line) => {
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

    return statement[line.deliveryMode];
  };
};
