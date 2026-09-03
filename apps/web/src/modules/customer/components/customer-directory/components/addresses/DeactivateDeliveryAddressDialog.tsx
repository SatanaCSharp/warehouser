import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CustomerRefusalAlert } from 'modules/customer/components/customer-directory/components/CustomerRefusalAlert';
import { Conditional } from 'shared/components/Conditional';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

import type { CustomerDeliveryAddress } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

export type DeactivateDeliveryAddressDialogProps = {
  address: CustomerDeliveryAddress;
  onConfirm: () => Promise<MutationResult>;
};

/**
 * Deactivates a Delivery Address (`ee6Ez` `Zzn8c`, AC-06a). There is nothing
 * to fill in and nothing to validate — one decision and no value to get wrong
 * — so it takes the **alert** dialog rather than the form dialog
 * (design-handoff.md §Component mapping).
 *
 * Its body states what stops (the address is no longer offered where one is
 * chosen) and what does not (every Customer Order and every frozen Purchase
 * Draft Line that already names it keeps reading and counting exactly as
 * before). Deactivating the **Main** address additionally makes one of the
 * remaining active addresses Main in the same transaction, so the dialog says
 * so before it happens rather than leaving the member to discover it on the
 * next order (AC-06b, tile `QRFjQ`).
 *
 * The address is rendered as text inside the confirmation for the same reason
 * `CustomerAddressRow` renders it as text: it is confidential free text this
 * system never interprets (spec.md §6.1).
 *
 * AC-07 — the Customer's last active address is refused by the server, and
 * `CustomerRefusalAlert` is what states the rule and the order the member must
 * follow.
 */
export const DeactivateDeliveryAddressDialog = ({
  address,
  onConfirm,
}: DeactivateDeliveryAddressDialogProps): ReactElement => {
  const { t } = useTranslation('customer');
  const [refusalCode, setRefusalCode] = useState<string>();

  return (
    <ConfirmAlertDialog
      title={t('dialogs.deactivateAddress.title')}
      cancelLabel={t('dialogs.deactivateAddress.cancel')}
      confirmLabel={t('dialogs.deactivateAddress.submit')}
      confirmVariant="primary"
      status="warning"
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p className="whitespace-pre-line break-words font-medium text-foreground">
        {address.addressText}
      </p>
      <p className="text-muted">{t('dialogs.deactivateAddress.lede')}</p>
      <p>{t('dialogs.deactivateAddress.recordsKeepCounting')}</p>
      <Conditional when={address.isMain}>
        <p>{t('dialogs.deactivateAddress.mainMoves')}</p>
      </Conditional>
      <p>{t('dialogs.deactivateAddress.reversible')}</p>
      <CustomerRefusalAlert code={refusalCode} />
    </ConfirmAlertDialog>
  );
};
