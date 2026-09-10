import type { CustomerOrder } from '@warehouser/contracts/customer-orders';
import { customerOrderIdentity } from 'modules/customer-order/utils/customer-order-identity';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export type CustomerOrderNaming = (order: CustomerOrder) => string;

/**
 * What a **sentence about** one Customer Order calls its customer: the kebab's
 * "Actions for …", and the subject each success toast states its outcome about
 * (`shared/alerts/mutation-actions.ts`).
 *
 * It is not what the row draws. The row's own presentation is
 * `CustomerOrderIdentityCell`, which says "customer identity withheld" as a
 * statement in its own right (AC-09a); a sentence interpolating that statement
 * as a name would not read as English. This projection therefore answers with
 * the noun phrase such a sentence needs, and — like the cell — never with a
 * blank, which would leave a member reading "Actions for" and a toast naming
 * nobody.
 *
 * It is stable per language, so a caller may key a memo on it and rebuild
 * exactly when the copy it produces changes.
 */
export const useCustomerOrderNaming = (): CustomerOrderNaming => {
  const { t } = useTranslation('customer-order');

  return useCallback(
    (order: CustomerOrder): string =>
      customerOrderIdentity(order).name ??
      t('demand.customerOrder.withheldName'),
    [t],
  );
};
