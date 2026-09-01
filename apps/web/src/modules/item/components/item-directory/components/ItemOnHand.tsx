import { useTranslation } from 'react-i18next';

import { selectCurrentUser } from 'modules/auth/store/auth.selectors';
import { Conditional } from 'shared/components/Conditional';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';
import { useAppSelector } from 'store/hooks';

import type { Item } from '@warehouser/contracts/items';
import type { ReactElement } from 'react';

export type ItemOnHandProps = {
  item: Item;
  /**
   * Whether the unit of measure is stated beside the figure. The table has a
   * unit column and the mobile card does not, so the card asks for it here
   * rather than restating the figure itself.
   */
  withUnit?: boolean;
};

/**
 * What an Item has on hand: the counted figure and, under it, the reason line
 * `24 Aug 2026 · cycle count · by you` (frame `XIvAZ`).
 *
 * That line is part of the contract this renders, not decoration (AC-08,
 * design-handoff.md § Component mapping, § Implementation constraints) — a
 * surface showing `60` without when, why and by whom is missing three quarters
 * of the fact. Both the table cell and the mobile card render this one
 * component, so neither can drop it on its own.
 *
 * **Attribution names a person only as "you".** `users` carries no name column
 * and a member is identified by an optional email alone, so the acting user's
 * own adjustment reads `by you` and everyone else's reads the neutral fallback.
 * Nothing here fabricates a display name.
 *
 * The figure goes through `useLocaleFormat()` and the date through
 * `format.shortTimestampDate`, so no ungrouped number and no raw ISO string reaches
 * the page. It is a component rather than an expression in the row renderer for
 * the reason every cell here is one: a React Aria row renderer may call no hook
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const ItemOnHand = ({
  item,
  withUnit = false,
}: ItemOnHandProps): ReactElement => {
  const { t } = useTranslation('item');
  const format = useLocaleFormat();
  const actor = useAppSelector(selectCurrentUser);
  const adjustment = item.latestAdjustment;
  const isActor = actor !== null && adjustment?.adjustedByUserId === actor.id;

  const reason =
    adjustment === null
      ? t('onHand.never')
      : t('onHand.recorded', {
          // `XIvAZ.png` draws this line as `24 Aug · cycle count · by you` — day and
          // month only. The year is already established by the column beside it, and
          // design-handoff.md names this line part of the contract.
          date: format.shortTimestampDate(adjustment.adjustedAt),
          reason: adjustment.reason,
          actor: t(isActor ? 'onHand.byYou' : 'onHand.byAnother'),
        });

  return (
    <>
      <p className="font-semibold text-foreground">
        {format.quantity(item.onHandQuantity)}
        <Conditional when={withUnit}>
          <span className="ml-1 text-sm font-normal text-muted">
            {item.unitOfMeasure}
          </span>
        </Conditional>
      </p>
      <p className="text-xs text-muted">{reason}</p>
    </>
  );
};
