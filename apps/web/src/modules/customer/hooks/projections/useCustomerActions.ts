import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';

import type { Customer } from '@warehouser/contracts/customers';

export type CustomerAction = {
  id: 'correct' | 'toggleActive';
  label: string;
  /** The Permission that offers this action. */
  permission: PermissionId;
  /**
   * Whether the action is offered but refused (AC-23). Both actions change
   * what the Warehouse holds, so an archived Warehouse disables them rather
   * than withholding them — a withheld control is what a Permission does, and
   * archiving is not a Permission.
   */
  isDisabled: boolean;
  /** The element stating why the action is disabled, for `aria-describedby`. */
  reasonId: string | undefined;
  run: () => void;
};

/**
 * What the detail header hands its kebab: two reports upward and nothing else.
 * Each only tells the surface that owns the dialogs which Customer was chosen.
 *
 * Reactivation is deliberately absent from this pair: it asks nothing, so the
 * menu runs it itself rather than reporting it — see `CustomerActionsMenu`.
 */
export type CustomerActionHandlers = {
  onCorrect: (customer: Customer) => void;
  onDeactivate: (customer: Customer) => void;
};

/** What `useCustomerActions` runs when an action is chosen. */
export type CustomerActionRunners = {
  onCorrect: (customer: Customer) => void;
  onToggleActive: (customer: Customer) => void;
};

/**
 * One Customer's actions, kept to the ones the actor's Role admits (AC-03b,
 * AC-06) and disabled — never hidden — while the Warehouse is archived
 * (AC-23). The surface that draws a kebab for a Customer reads this one
 * projection rather than declaring its own Permission mapping
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 *
 * It is called by the component that renders the actions, never by whatever
 * renders the collection above it: a value read above a collection and closed
 * over keeps whatever it was when the row was first built
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const useCustomerActions = (
  customer: Customer,
  { onCorrect, onToggleActive }: CustomerActionRunners,
): CustomerAction[] => {
  const { t } = useTranslation('customer');
  const { isArchived, reasonId } = useArchivedWarehouse();
  const isInactive = customer.deactivatedAt !== null;

  return usePermittedItems<CustomerAction>([
    {
      id: 'correct',
      label: t('menu.customer.correct'),
      permission: PermissionId.CUSTOMERS_UPDATE,
      isDisabled: isArchived,
      reasonId,
      run: () => onCorrect(customer),
    },
    {
      id: 'toggleActive',
      label: isInactive
        ? t('menu.customer.reactivate')
        : t('menu.customer.deactivate'),
      permission: PermissionId.CUSTOMERS_DEACTIVATE,
      isDisabled: isArchived,
      reasonId,
      run: () => onToggleActive(customer),
    },
  ]);
};
