import { Alert } from '@heroui/react';
import { ErrorCode } from '@warehouser/shared-types/enums';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type AddressDisagreementAlertProps = {
  /** The stable refusal code the dialog was handed, or nothing yet. */
  code?: string;
  /** The address this line ships to. */
  lineDeliveryAddressText: string | null;
  /** The address the picked Customer Order is going to, or `null` for an order recorded by typed name, which goes to no Delivery Address at all. */
  orderDeliveryAddressText: string | null;
};

/**
 * AC-15 — a Direct to Customer line's link is refused when the Customer
 * Order goes to a different Delivery Address, of the same Customer or
 * another. Names the address each of the two is bound for
 * (`purchase_drafts.delivery_address_disagreement`, `openapi.yaml`
 * `PurchaseDraftLinkConflict` `addressDisagreement`).
 *
 * Both addresses are read from what the dialog already has on screen — the
 * line it was opened for and the order the member picked — rather than from
 * the refusal's own `details`, which carries only identifiers and no text.
 */
export const AddressDisagreementAlert = ({
  code,
  lineDeliveryAddressText,
  orderDeliveryAddressText,
}: AddressDisagreementAlertProps): ReactElement | null => {
  const { t } = useTranslation('purchase-draft');

  if (code !== ErrorCode.PURCHASE_DRAFTS_DELIVERY_ADDRESS_DISAGREEMENT) {
    return null;
  }

  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {t('dialogs.addLink.refusal.addressDisagreementTitle')}
        </Alert.Title>
        <Alert.Description>
          {t('dialogs.addLink.refusal.addressDisagreement', {
            context:
              orderDeliveryAddressText === null ? 'noOrderAddress' : undefined,
            lineAddress: lineDeliveryAddressText ?? '',
            orderAddress: orderDeliveryAddressText ?? '',
          })}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
};
