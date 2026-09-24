import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldXIcon } from 'shared/icons';

/**
 * AC-02 — the statement a member carrying no Panel's whole Permission set
 * reaches. It names no Panel, no Permission and nothing the Warehouse holds,
 * and draws no frame, axis or total (`design-handoff.md` § Implementation
 * constraints; frame `G4JNMV` tile 3).
 *
 * The shipped denial pattern states its heading as an `h1`; this one does not,
 * because the destination's `h1` is the page's own visually-hidden heading and
 * the surface's heading order is `h1 -> h2 x n` (`design-handoff.md`
 * § Accessibility). Everything else — the icon, the muted body, the
 * `max-w-3xl` column — is that pattern unchanged.
 */
export const WarehouseDashboardDenial = (): ReactElement => {
  const { t } = useTranslation('dashboard');

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-left">
      <div className="text-muted">
        <ShieldXIcon />
      </div>
      <p className="mt-4 text-lg font-semibold text-foreground">
        {t('warehouse.denial.heading')}
      </p>
      <p className="mt-3 text-muted">{t('warehouse.denial.description')}</p>
    </div>
  );
};
