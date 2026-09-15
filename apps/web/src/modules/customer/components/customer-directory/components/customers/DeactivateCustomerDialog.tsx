import { Alert } from '@heroui/react';
import type { Customer } from '@warehouser/contracts/customers';
import { CustomerRefusalAlert } from 'modules/customer/components/customer-directory/components/CustomerRefusalAlert';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { Conditional } from 'shared/components/Conditional';
import { ConfirmAlertDialog } from 'shared/components/ConfirmAlertDialog';

export type DeactivateCustomerDialogProps = {
  customer: Customer;
  /** How many Unfulfilled Customer Orders are still waiting on this Customer. */
  outstandingOrderCount: number;
  onConfirm: () => Promise<MutationResult>;
};

/**
 * Deactivates a Customer while keeping everything that names it readable
 * (`ee6Ez` `E71Vi`, AC-06). There is nothing to fill in and nothing to
 * validate, so it takes the **alert** dialog rather than the form dialog
 * (design-handoff.md §Component mapping).
 *
 * Its body is the four things AC-06 actually promises, in the two panels the
 * frame draws them as rather than as a run of bare sentences: a neutral
 * **What stays** panel — every Customer Order already naming it keeps counting
 * exactly as before, its addresses stay in the state they were already in, and
 * the name stays taken — and, when the Customer is still waiting for
 * something, a warning panel saying how much and that deactivating neither
 * fulfils nor cancels nor hides it. That the withdrawal is reversible is
 * stated under both.
 *
 * The confirmation takes `ConfirmAlertDialog`'s own `danger` treatment. It
 * used to override that with a `primary` confirm and a `warning` icon on the
 * reasoning that deactivation is reversible; the design draws the destructive
 * primary (`ee6Ez`, design-handoff.md §Component mapping: "Destructive
 * primaries are solid `danger`"), and reversibility is what the body says
 * rather than what the button colour whispers.
 */
export const DeactivateCustomerDialog = ({
  customer,
  outstandingOrderCount,
  onConfirm,
}: DeactivateCustomerDialogProps): ReactElement => {
  const { t } = useTranslation('customer');
  const [refusalCode, setRefusalCode] = useState<string>();

  return (
    <ConfirmAlertDialog
      title={t('dialogs.deactivate.title', { name: customer.name })}
      cancelLabel={t('dialogs.deactivate.cancel')}
      confirmLabel={t('dialogs.deactivate.submit')}
      onConfirm={onConfirm}
      onRefusal={setRefusalCode}
    >
      <p className="text-muted">{t('dialogs.deactivate.lede')}</p>
      <Alert>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{t('dialogs.deactivate.staysTitle')}</Alert.Title>
          <Alert.Description>
            {t('dialogs.deactivate.ordersKeepCounting')}
          </Alert.Description>
          <Alert.Description>
            {t('dialogs.deactivate.addressesUnchanged')}
          </Alert.Description>
          <Alert.Description>
            {t('dialogs.deactivate.nameStaysTaken')}
          </Alert.Description>
        </Alert.Content>
      </Alert>
      {/* A Customer waiting for nothing has nothing to be warned about, so the
          warning panel is withheld rather than shown counting zero. */}
      <Conditional when={outstandingOrderCount > 0}>
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t('dialogs.deactivate.awaitingTitle')}</Alert.Title>
            <Alert.Description>
              {t('dialogs.deactivate.awaitingDescription', {
                count: outstandingOrderCount,
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </Conditional>
      <p className="text-muted">{t('dialogs.deactivate.reversible')}</p>
      <CustomerRefusalAlert code={refusalCode} />
    </ConfirmAlertDialog>
  );
};
