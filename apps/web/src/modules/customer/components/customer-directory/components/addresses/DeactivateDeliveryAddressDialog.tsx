import { Alert } from '@heroui/react';
import type { CustomerDeliveryAddress } from '@warehouser/contracts/customers';
import { CustomerRefusalAlert } from 'modules/customer/components/customer-directory/components/CustomerRefusalAlert';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { Conditional } from 'shared/components/Conditional';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

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
 * Its body is the two panels the frame draws: a neutral **What stays** panel —
 * every Customer Order and every frozen Purchase Draft Line that already names
 * the address keeps reading and counting exactly as before — and, when the
 * address is the **Main** one, a warning panel saying that one of the
 * remaining active addresses becomes Main in the same transaction, so the
 * member is told before it happens rather than discovering it on the next
 * order (AC-06b, tile `QRFjQ`).
 *
 * It does not promise to say **which** address that becomes: the address book
 * itself carries that answer — the promoted address's `Main` chip is visible
 * in the same list the moment the dialog closes (`CustomerAddressRow`) — and
 * naming a specific address's text in a toast, the one surface that outlives
 * this dialog, would put confidential free text (spec.md §6.1) somewhere the
 * address-confidentiality design deliberately keeps it out of
 * (`shared/alerts/mutation-actions.ts`).
 *
 * The address is rendered as text inside the confirmation for the same reason
 * `CustomerAddressRow` renders it as text: it is confidential free text this
 * system never interprets (spec.md §6.1).
 *
 * The confirmation takes `ConfirmAlertDialog`'s own `danger` treatment rather
 * than overriding it with a `primary` confirm: the design draws the
 * destructive primary as solid `danger` (design-handoff.md §Component
 * mapping), and that the withdrawal is reversible is what the body says.
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
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p className="whitespace-pre-line break-words font-medium text-foreground">
        {address.addressText}
      </p>
      <p className="text-muted">{t('dialogs.deactivateAddress.lede')}</p>
      <Alert>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('dialogs.deactivateAddress.staysTitle')}</Alert.Title>
          <Alert.Description>
            {t('dialogs.deactivateAddress.recordsKeepCounting')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <Conditional when={address.isMain}>
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t('dialogs.deactivateAddress.mainTitle')}
            </Alert.Title>
            <Alert.Description>
              {t('dialogs.deactivateAddress.mainMoves')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
      <p className="text-muted">{t('dialogs.deactivateAddress.reversible')}</p>
      <CustomerRefusalAlert code={refusalCode} />
    </ConfirmAlertDialog>
  );
};
