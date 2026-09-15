import { RecordDemandAction } from 'modules/customer-order/components/demand-directory/components/RecordDemandAction';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DatasetEmptyState } from 'shared/components/DatasetEmptyState';
import { ClipboardListIcon } from 'shared/icons';

/**
 * What the Demand destination paints when no customer is waiting for anything
 * (AC-04, frame `hWFRW` tile `mEZpI`): a heading naming why the list is empty,
 * an explanation, and the one action that fills it.
 *
 * The same state is reached when every Customer Order has been Fulfilled or
 * cancelled — those never count towards a Demand Line — which is why the
 * heading says no customer is waiting rather than that nothing was ever
 * recorded.
 *
 * `RecordDemandAction` gates itself on `CUSTOMER_ORDERS:CREATE`, so an actor
 * who may not record demand is offered no control here rather than a withheld
 * one (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
 */
export const DemandEmptyState = (): ReactElement => {
  const { t } = useTranslation('customer-order');

  return (
    <DatasetEmptyState
      action={<RecordDemandAction />}
      description={t('demand.empty.description')}
      heading={t('demand.empty.heading')}
      icon={<ClipboardListIcon />}
    />
  );
};
