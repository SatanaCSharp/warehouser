import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CustomerRefusalAlert } from 'modules/customer/components/customer-directory/components/CustomerRefusalAlert';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

import type { Customer } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type DeactivateCustomerDialogProps = {
  customer: Customer;
  onConfirm: () => Promise<MutationResult>;
};

/**
 * Deactivates a Customer while keeping everything that names it readable
 * (`ee6Ez` `E71Vi`, AC-06). There is nothing to fill in and nothing to
 * validate, so it takes the **alert** dialog rather than the form dialog
 * (design-handoff.md §Component mapping).
 *
 * Its body is the four things AC-06 actually promises, in the frame's order:
 * what stops (it is no longer offered when demand is recorded), what does not
 * (every Customer Order already naming it keeps counting exactly as before,
 * and its addresses stay in the state they were already in), what stays taken
 * (the name), and that it is reversible. Deactivating is not destructive, so
 * its confirm is the primary variant rather than a danger one.
 */
export const DeactivateCustomerDialog = ({
  customer,
  onConfirm,
}: DeactivateCustomerDialogProps): ReactElement => {
  const { t } = useTranslation('customer');
  const [refusalCode, setRefusalCode] = useState<string>();

  return (
    <ConfirmAlertDialog
      title={t('dialogs.deactivate.title', { name: customer.name })}
      cancelLabel={t('dialogs.deactivate.cancel')}
      confirmLabel={t('dialogs.deactivate.submit')}
      confirmVariant="primary"
      status="warning"
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p className="text-muted">{t('dialogs.deactivate.lede')}</p>
      <p>{t('dialogs.deactivate.ordersKeepCounting')}</p>
      <p>{t('dialogs.deactivate.addressesUnchanged')}</p>
      <p>{t('dialogs.deactivate.nameStaysTaken')}</p>
      <p>{t('dialogs.deactivate.reversible')}</p>
      <CustomerRefusalAlert code={refusalCode} />
    </ConfirmAlertDialog>
  );
};
