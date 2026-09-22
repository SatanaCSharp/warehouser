import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldXIcon } from 'shared/icons';

/**
 * AC-15 — the statement a Workspace Member whose Workspace Role does not carry
 * the observation Permission reaches, **at the address** rather than after a
 * redirect away from it. It names no Warehouse, no Permission and no figure,
 * and discloses neither how many Warehouses the Workspace holds nor whether
 * any of them has anything outstanding (frame `ujNPP` tile 1).
 *
 * AC-22 — a Warehouse Member holding every watch Permission in their own
 * Warehouse and no Workspace Role reaches this same statement, unchanged.
 *
 * It is the shipped denial pattern, and states its heading as a `p` rather
 * than an `h1` for the reason `modules/warehouse`'s does: the destination's
 * `h1` is the page's own visually-hidden heading and the surface's heading
 * order is `h1 -> h2 x n` (`design-handoff.md` § Accessibility).
 */
export const WorkspaceDashboardDenial = (): ReactElement => {
  const { t } = useTranslation('dashboard');

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-left">
      <div className="text-muted">
        <ShieldXIcon />
      </div>
      <p className="mt-4 text-lg font-semibold text-foreground">
        {t('workspace.denial.heading')}
      </p>
      <p className="mt-3 text-muted">{t('workspace.denial.description')}</p>
    </div>
  );
};
