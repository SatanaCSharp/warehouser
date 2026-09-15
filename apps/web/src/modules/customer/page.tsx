import { PermissionId } from '@warehouser/shared-types/enums';
import { CustomerDirectory } from 'modules/customer/components/customer-directory/CustomerDirectory';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ArchivedWarehouseChip } from 'shared/components/ArchivedWarehouseChip';
import { ArchivedWarehouseNotice } from 'shared/components/ArchivedWarehouseNotice';
import { useCurrentPermissions } from 'shared/hooks/queries/usePermissions';

/**
 * The Customers destination (frames `KRDln` desktop, `b7gaH9` mobile). The
 * route loader already awaited the Customers list for an actor holding
 * `CUSTOMERS:WATCH` (`loaders/customer.loader.ts`); this page reads the same
 * projection to decide between the directory and a denial, exactly as
 * `ItemPage` does.
 *
 * AC-09 — the denial names no customer, no address, no quantity and no Item,
 * and **presents no count**: it is one sentence, and the loader has already
 * guaranteed that nothing was fetched to count.
 */
export const CustomerPage = (): ReactElement => {
  const { t } = useTranslation('customer');
  const { access, permissionIds } = useCurrentPermissions();

  if (!access || !permissionIds.includes(PermissionId.CUSTOMERS_WATCH)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-foreground">
          {t('head.title')}
        </h1>
        <p className="mt-3 text-muted">{t('directory.error')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-foreground">
          {t('directory.heading')}
        </h1>
        <ArchivedWarehouseChip />
      </div>
      <p className="mt-3 max-w-prose text-muted">{t('directory.lede')}</p>
      {/* The notice draws nothing in a Warehouse still in operation, so its
          spacing collapses with it rather than leaving a gap behind. */}
      <div className="mt-4 empty:hidden">
        <ArchivedWarehouseNotice />
      </div>

      <CustomerDirectory />
    </main>
  );
};

export default CustomerPage;
