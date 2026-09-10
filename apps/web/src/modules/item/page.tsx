import { PermissionId } from '@warehouser/shared-types/enums';
import { ItemDirectory } from 'modules/item/components/item-directory/ItemDirectory';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ArchivedWarehouseChip } from 'shared/components/ArchivedWarehouseChip';
import { ArchivedWarehouseNotice } from 'shared/components/ArchivedWarehouseNotice';
import { useCurrentPermissions } from 'shared/hooks/queries/usePermissions';

/**
 * The Items destination (T18, design-handoff.md `XIvAZ`/`VHU6r`). The route
 * loader already awaited the Items list for an actor holding `ITEMS:WATCH`
 * (`loaders/item.loader.ts`); this page reads the same projection to decide
 * between the catalogue and a denial, exactly as `AccessPage` does for the
 * access workspace.
 *
 * It owns the destination's masthead — the heading, the archived-Warehouse chip
 * beside it, the lede that says what a SKU means here, and the one notice every
 * disabled control on the page points at with `aria-describedby` (AC-23, frame
 * `hWFRW` tile `TPZTI`). The notice is rendered unconditionally: it draws
 * nothing at all in a Warehouse still in operation, so the page states no
 * visibility flag (`writing-web-components.md` §6).
 */
export const ItemPage = (): ReactElement => {
  const { t } = useTranslation('item');
  const { access, permissionIds } = useCurrentPermissions();

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

      <ItemDirectory />
    </main>
  );
};

export default ItemPage;
