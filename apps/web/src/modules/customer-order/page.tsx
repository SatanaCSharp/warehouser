import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { DemandDirectory } from 'modules/customer-order/components/demand-directory/DemandDirectory';
import { useDemand } from 'modules/customer-order/hooks/queries/useDemand';
import { useCurrentPermissions } from 'shared/hooks/queries/usePermissions';

import type { ReactElement } from 'react';

/**
 * The Demand destination (T19, design-handoff.md `G6jhw`/`SjdPo`). The route
 * loader already awaited the consolidated demand for an actor holding
 * `CUSTOMER_ORDERS:WATCH` (`loaders/demand.loader.ts`); this page reads the
 * same projection to decide between the directory and a denial, exactly as
 * `ItemPage` does for the Items destination.
 *
 * A permitted actor whose read failed (`useDemand().isError`) still reaches
 * this page's own error arm rather than the empty-demand surface, matching
 * the narrowest-owner rule (`frontend-architecture.md` §Page).
 */
export const CustomerOrderPage = (): ReactElement => {
  const { t } = useTranslation('customer-order');
  const { access, permissionIds } = useCurrentPermissions();
  const { isError, lines } = useDemand();

  if (
    !access ||
    !permissionIds.includes(PermissionId.CUSTOMER_ORDERS_WATCH) ||
    isError
  ) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-foreground">
          {t('head.title')}
        </h1>
        <p role="alert" className="mt-3 text-muted">
          {t('demand.error')}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <DemandDirectory demandLines={lines} />
    </main>
  );
};

export default CustomerOrderPage;
