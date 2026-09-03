import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { CustomerAddressActionsMenu } from 'modules/customer/components/customer-directory/components/addresses/CustomerAddressActionsMenu';
import { Conditional } from 'shared/components/Conditional';

import type { CustomerDeliveryAddress } from '@warehouser/contracts/customers';
import type { DeliveryAddressActionHandlers } from 'modules/customer/hooks/projections/useDeliveryAddressActions';
import type { ReactElement } from 'react';

export type CustomerAddressRowProps = DeliveryAddressActionHandlers & {
  address: CustomerDeliveryAddress;
  customerId: string;
  customerName: string;
};

/**
 * `Delivery/Address Row` (`LdZmY`): the address text, its access notes, the
 * `Main` / `Inactive` chips, and the kebab whose accessible name identifies
 * its subject — `Actions for Hafenstraße 14, 20457 Hamburg`
 * (design-handoff.md §Accessibility).
 *
 * **The address and the access notes are rendered as TEXT — never as markup
 * and never as a link.** That is a security property rather than a styling
 * choice: both are confidential free text a member typed, which this system
 * never validates, geocodes, normalizes or interprets (spec.md §3, §6.1). So
 * they are ordinary children of a `<p>`; nothing here reaches for
 * `dangerouslySetInnerHTML`, and nothing turns a substring that looks like a
 * URL into an anchor. `CustomerDirectory.spec.tsx` asserts exactly that.
 *
 * The text wraps rather than truncating: an address is long by nature, and a
 * truncated one is an ambiguous one (design-handoff.md §Accessibility).
 */
export const CustomerAddressRow = ({
  address,
  customerId,
  customerName,
  onCorrect,
  onDeactivate,
}: CustomerAddressRowProps): ReactElement => {
  const { t } = useTranslation('customer');
  const isInactive = address.deactivatedAt !== null;

  return (
    <li
      className={`flex items-start justify-between gap-3 rounded-lg border border-border-secondary bg-surface-secondary p-4 ${
        isInactive ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line break-words text-foreground">
          {address.addressText}
        </p>
        <Conditional when={address.accessNotes !== null}>
          <p className="mt-1 whitespace-pre-line break-words text-sm text-muted">
            {address.accessNotes}
          </p>
        </Conditional>
        <div className="mt-2 flex flex-wrap gap-2">
          <Conditional when={address.isMain}>
            <Chip color="accent" size="sm" variant="soft">
              {t('detail.addresses.main')}
            </Chip>
          </Conditional>
          <Conditional when={isInactive}>
            <Chip color="default" size="sm" variant="soft">
              {t('detail.addresses.inactive')}
            </Chip>
          </Conditional>
        </div>
      </div>
      <CustomerAddressActionsMenu
        address={address}
        customerId={customerId}
        customerName={customerName}
        onCorrect={onCorrect}
        onDeactivate={onDeactivate}
      />
    </li>
  );
};
