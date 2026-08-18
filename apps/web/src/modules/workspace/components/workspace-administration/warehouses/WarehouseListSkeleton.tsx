import { Skeleton } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { ReactElement } from 'react';

/**
 * The loading placeholder of the Warehouse list (AC-33). It is labelled rather
 * than silent, so an actor waiting on the list is told what is loading instead
 * of meeting three unnamed blocks, and it shows the shape the list will take
 * rather than a spinner.
 */
export const WarehouseListSkeleton = (): ReactElement => {
  const { t } = useTranslation('warehouse');

  return (
    <div aria-label={t('warehouses.loading')} className="mt-3 space-y-3">
      <Skeleton className="h-16 rounded-lg" />
      <Skeleton className="h-16 rounded-lg" />
      <Skeleton className="h-16 rounded-lg" />
    </div>
  );
};
