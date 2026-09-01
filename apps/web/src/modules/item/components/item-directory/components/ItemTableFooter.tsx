import { useTranslation } from 'react-i18next';

import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type { Item } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';

export type ItemTableFooterProps = {
  items: Item[];
};

/**
 * The Items table's footer row (frame `XIvAZ`): `5 items · 1 inactive` on the
 * left, and on the right the sentence that says what an inactive Item still
 * does — `An inactive item keeps its SKU and keeps counting on every record
 * that already names it.`
 *
 * design-handoff.md § Implementation constraints lists that sentence among the
 * things the implementation must preserve, because it is the whole answer to
 * "what did deactivating it actually do?" (AC-06d) at the place a member reads
 * the `Inactive` chips.
 *
 * Both counts go through i18next's plural forms rather than being assembled
 * from a numeral and a noun — `uk` has three plural categories where `en` has
 * two — and the summary interpolates the two resolved phrases rather than
 * concatenating them with a separator in JSX. `count` picks the plural form
 * while `formatted` is what renders, because a catalogue of two thousand Items
 * must read `2 000 items` rather than `2000` (design-handoff.md § Numbers).
 */
export const ItemTableFooter = ({
  items,
}: ItemTableFooterProps): ReactElement => {
  const { t } = useTranslation('item');
  const format = useLocaleFormat();
  const inactiveCount = items.filter(
    (item) => item.deactivatedAt !== null,
  ).length;
  const itemsPhrase = t('directory.footer.items', {
    count: items.length,
    formatted: format.quantity(items.length),
  });

  const summary =
    inactiveCount === 0
      ? t('directory.footer.summaryAllActive', { items: itemsPhrase })
      : t('directory.footer.summary', {
          items: itemsPhrase,
          inactive: t('directory.footer.inactive', {
            count: inactiveCount,
            formatted: format.quantity(inactiveCount),
          }),
        });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <span className="font-medium text-foreground">{summary}</span>
      <span className="text-muted">{t('directory.footer.note')}</span>
    </div>
  );
};
