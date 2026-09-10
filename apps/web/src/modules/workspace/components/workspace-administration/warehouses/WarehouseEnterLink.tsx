import { buttonVariants } from '@heroui/styles';
import { Link as RouterLink } from '@tanstack/react-router';
import type { Warehouse } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ROUTES } from 'shared/constants/routes';
import { LogInIcon } from 'shared/icons';

type WarehouseEnterLinkProps = {
  warehouse: Warehouse;
};

/**
 * The Enter affordance of one Warehouse row (CR-AC-13). Its owner renders it as
 * a **sibling** of the row's selection `<button>` and never nested inside it —
 * a link cannot nest inside a button — so the selection button stays first in
 * focus order while Enter still draws inside the Warehouse block beside the
 * name (`zubpS`, `XeG2t`).
 *
 * Every row renders this same visible word, so a bare label would leave a
 * screen-reader link list showing N identical "Enter" links with nothing to
 * tell them apart. The accessible name therefore names this link's own
 * Warehouse; the visible label stays short, as the approved row draws it.
 */
export const WarehouseEnterLink = ({
  warehouse,
}: WarehouseEnterLinkProps): ReactElement => {
  const { t } = useTranslation('warehouse');

  return (
    <RouterLink
      to={ROUTES.WAREHOUSE}
      params={{ warehouseId: warehouse.id }}
      aria-label={t('warehouses.enterNamed', {
        name: warehouse.name,
      })}
      className={`shrink-0 gap-1.5 ${buttonVariants({ variant: 'tertiary', size: 'sm' })}`}
    >
      <LogInIcon />
      {t('warehouses.enter')}
    </RouterLink>
  );
};
