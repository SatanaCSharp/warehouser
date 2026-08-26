import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { ItemDirectory } from 'modules/item/components/item-directory/ItemDirectory';
import { useItems } from 'modules/item/hooks/queries/useItems';
import { useCurrentPermissions } from 'shared/hooks/queries/usePermissions';

import type { ReactElement } from 'react';

/**
 * The Items destination (T18, design-handoff.md `XIvAZ`/`VHU6r`). The route
 * loader already awaited the Items list for an actor holding `ITEMS:WATCH`
 * (`loaders/item.loader.ts`); this page reads the same projection to decide
 * between the catalogue and a denial, exactly as `AccessPage` does for the
 * access workspace.
 */
export const ItemPage = (): ReactElement => {
  const { t } = useTranslation('item');
  const { access, permissionIds } = useCurrentPermissions();
  const items = useItems();

  if (!access || !permissionIds.includes(PermissionId.ITEMS_WATCH)) {
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
    <main className="mx-auto max-w-5xl px-6 py-12">
      <ItemDirectory items={items} />
    </main>
  );
};

export default ItemPage;
