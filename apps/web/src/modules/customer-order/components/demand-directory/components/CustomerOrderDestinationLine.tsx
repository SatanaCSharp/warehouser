import type { CustomerOrderDestination } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPinIcon } from 'shared/icons';

export type CustomerOrderDestinationLineProps = {
  /**
   * Where this order's goods are going, or `null` when it names nowhere. It
   * gates itself on that rather than taking a visibility flag, which is what
   * lets the identity lookup above it build every arm eagerly
   * (`writing-web-conditional-components.md` §2, §4).
   */
  destination: CustomerOrderDestination | null;
};

/**
 * The destination line under the customer name on `Delivery/Customer Order
 * Row` (`GGjUJ`) and its mobile card (`T0O6LF`): the address the goods are
 * going to.
 *
 * The pin is `aria-hidden`, so on its own it says nothing at all to a screen
 * reader — and AC-24 makes its **absence** carry meaning, which no glyph can
 * do for a member who cannot see it. "Going to" is therefore rendered as text
 * beside it rather than left implicit in the icon, and a typed-name order gets
 * the matching sentence instead of a missing picture
 * (design-handoff.md §Accessibility, §Icons).
 *
 * The address is rendered as text, never as markup and never as a link, for
 * the same reason `CustomerAddressRow` renders it as text: it is confidential
 * text a member typed and this product never interprets (spec.md §6.1).
 */
export const CustomerOrderDestinationLine = ({
  destination,
}: CustomerOrderDestinationLineProps): ReactElement | null => {
  const { t } = useTranslation('customer-order');

  if (!destination) {
    return null;
  }

  return (
    <span className="mt-1 flex items-start gap-1.5 text-sm text-muted">
      <span className="mt-0.5 shrink-0">
        <MapPinIcon />
      </span>
      <span className="min-w-0 whitespace-pre-line break-words">
        {t('demand.customerOrder.goingTo', {
          address: destination.addressText,
        })}
      </span>
    </span>
  );
};
