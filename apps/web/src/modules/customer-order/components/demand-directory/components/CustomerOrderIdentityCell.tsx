import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import { CustomerOrderDestinationLine } from 'modules/customer-order/components/demand-directory/components/CustomerOrderDestinationLine';
import type { CustomerOrderIdentityKind } from 'modules/customer-order/utils/customer-order-identity';
import { customerOrderIdentity } from 'modules/customer-order/utils/customer-order-identity';
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type CustomerOrderIdentityCellProps = {
  order: CustomerOrder;
};

/**
 * Who one Customer Order is for and where its goods are going —
 * `Delivery/Customer Order Row` (`GGjUJ`) and `Delivery/Customer Order Card
 * Mobile` (`T0O6LF`) draw the same two lines, so both render this one
 * component and neither can present the identity differently from the other.
 *
 * The three arms are the three ways identity reads
 * (`utils/customer-order-identity.ts`), resolved to a **name** and rendered
 * through a total lookup, so a fourth can never be added without being given
 * something to draw (`writing-web-components.md` §6):
 *
 * - **namedCustomer** — the Customer, with the address it is going to (AC-24).
 * - **typedName** — the name, and the sentence saying there is no address.
 *   The pin is absent, and the sentence is what carries that absence to a
 *   screen reader rather than leaving it to be inferred from a missing glyph.
 * - **withheld** — one statement and nothing else, identical for both kinds
 *   above, so a member without `CUSTOMERS:WATCH` cannot tell which kind a row
 *   is (AC-09a). No name, no address, no pin, and no typed-name sentence.
 *
 * It is its own component rather than an expression in a cell because it reads
 * translations, and a React Aria row renderer may call no hook
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const CustomerOrderIdentityCell = ({
  order,
}: CustomerOrderIdentityCellProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const identity = customerOrderIdentity(order);

  // No empty-string fallback survives here: the withheld arm has no name to
  // fall back from, so it states that instead of leaving the slot blank.
  const name = identity.name ?? t('demand.customerOrder.withheld');

  // `ReactNode` rather than `ReactElement`, because one of the three arms is
  // deliberately nothing at all. The lookup stays **total**: adding a fourth
  // way identity can read still fails to compile until it is answered
  // (`writing-web-components.md` §6).
  const notes: Record<CustomerOrderIdentityKind, ReactNode> = {
    namedCustomer: (
      <CustomerOrderDestinationLine destination={identity.destination} />
    ),
    typedName: (
      <span className="mt-1 block text-sm text-muted">
        {t('demand.customerOrder.typedName')}
      </span>
    ),
    // The withheld statement is the whole presentation: a second line would be
    // one more thing to compare two rows by.
    withheld: null,
  };

  return (
    <span className="block min-w-0">
      <span
        className={
          identity.kind === 'withheld'
            ? 'block break-words text-muted'
            : 'block break-words text-foreground'
        }
      >
        {name}
      </span>
      {notes[identity.kind]}
    </span>
  );
};
