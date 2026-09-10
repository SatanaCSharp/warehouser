import type { CustomerDeliveryAddress } from '@warehouser/contracts/customers';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';
import { useArchivedWarehouse } from 'shared/hooks/projections/useArchivedWarehouse';
import { usePermittedItems } from 'shared/hooks/projections/usePermittedItems';

export type DeliveryAddressAction = {
  id: 'correct' | 'setMain' | 'toggleActive';
  label: string;
  permission: PermissionId;
  isDisabled: boolean;
  reasonId: string | undefined;
  run: () => void;
};

/** The one report an Address Row sends upward: which address to deactivate. */
export type DeliveryAddressActionHandlers = {
  onCorrect: (address: CustomerDeliveryAddress) => void;
  onDeactivate: (address: CustomerDeliveryAddress) => void;
};

export type DeliveryAddressActionRunners = {
  onCorrect: (address: CustomerDeliveryAddress) => void;
  onSetMain: (address: CustomerDeliveryAddress) => void;
  onToggleActive: (address: CustomerDeliveryAddress) => void;
};

/**
 * One Delivery Address's actions (`LdZmY`'s kebab), every one of them under
 * `CUSTOMERS:UPDATE` — maintaining a Customer's addresses is that one
 * Permission (spec.md §6.1) — and disabled rather than hidden while the
 * Warehouse is archived (AC-23).
 *
 * `setMain` is offered only for an **active, non-Main** address: an Inactive
 * one is refused by the server (`chk_customer_delivery_addresses_main_is_active`,
 * AC-06b) and marking the Main one Main again changes nothing, so neither is
 * worth offering. `toggleActive` names the direction the address can actually
 * go, which is what makes an Inactive address offer reactivation rather than a
 * second deactivation (AC-06a).
 */
export const useDeliveryAddressActions = (
  address: CustomerDeliveryAddress,
  { onCorrect, onSetMain, onToggleActive }: DeliveryAddressActionRunners,
): DeliveryAddressAction[] => {
  const { t } = useTranslation('customer');
  const { isArchived, reasonId } = useArchivedWarehouse();
  const isInactive = address.deactivatedAt !== null;

  const offersSetMain = !isInactive && !address.isMain;

  const actions: DeliveryAddressAction[] = [
    {
      id: 'correct',
      label: t('menu.address.correct'),
      permission: PermissionId.CUSTOMERS_UPDATE,
      isDisabled: isArchived,
      reasonId,
      run: () => onCorrect(address),
    },
    {
      id: 'toggleActive',
      label: isInactive
        ? t('menu.address.reactivate')
        : t('menu.address.deactivate'),
      permission: PermissionId.CUSTOMERS_UPDATE,
      isDisabled: isArchived,
      reasonId,
      run: () => onToggleActive(address),
    },
  ];

  const withSetMain: DeliveryAddressAction[] = offersSetMain
    ? [
        {
          id: 'setMain',
          label: t('menu.address.setMain'),
          permission: PermissionId.CUSTOMERS_UPDATE,
          isDisabled: isArchived,
          reasonId,
          run: () => onSetMain(address),
        },
        ...actions,
      ]
    : actions;

  return usePermittedItems<DeliveryAddressAction>(withSetMain);
};
