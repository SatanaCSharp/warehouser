import { WarehouseDashboardGrid } from 'modules/warehouse/components/dashboard/WarehouseDashboardGrid';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * T16 — the Warehouse Dashboard destination, the index child of the Warehouse
 * layout (sad.md §6.1). It owns only what the grid does not.
 *
 * **There is no masthead.** No visible heading, no lede, no chip row: AC-01
 * admits "no words beyond each Panel's own labels and the counts it states",
 * and the grid needs the whole of the 639px the content region gives it
 * (`design-handoff.md` § Grid geometry, § Approved deviations). The accessible
 * name is a visually-hidden `h1`, so the heading order stays `h1 -> h2 x n`
 * (`design-handoff.md` § Accessibility).
 *
 * It asks no readiness question and declares no waiting affordance of its own:
 * the route awaits every permitted figure before this mounts
 * (`frontend-architecture.md` §Page).
 */
export const WarehousePage = (): ReactElement => {
  const { t } = useTranslation('dashboard');

  return (
    <main className="max-w-none px-6 py-6">
      <h1 className="sr-only">{t('warehouse.heading')}</h1>
      <WarehouseDashboardGrid />
    </main>
  );
};
