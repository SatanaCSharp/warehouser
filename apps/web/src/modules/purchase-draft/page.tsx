import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { PurchaseDraftWorkspace } from 'modules/purchase-draft/components/PurchaseDraftWorkspace';
import { useCurrentPermissions } from 'shared/hooks/queries/usePermissions';

import type { ReactElement } from 'react';

/**
 * The Purchase drafts destination (T20, design-handoff.md
 * `yGhkK`/`F0SpRx`/`O42LHI`). The route loader already awaited the Purchase
 * Draft summaries for an actor holding `PURCHASE_DRAFTS:WATCH`
 * (`loaders/purchase-draft.loader.ts`); this page reads the same projection
 * to decide between the workspace and a denial, exactly as `ItemPage` does
 * for the Item catalogue.
 */
export const PurchaseDraftPage = (): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const { access, permissionIds } = useCurrentPermissions();

  if (!access || !permissionIds.includes(PermissionId.PURCHASE_DRAFTS_WATCH)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold text-foreground">
          {t('head.title')}
        </h1>
        <p className="mt-3 text-muted">{t('workspace.error')}</p>
      </main>
    );
  }

  return <PurchaseDraftWorkspace />;
};

export default PurchaseDraftPage;
