import type { PurchaseDraftDetail } from '@warehouser/contracts/purchase-drafts';
import mapValues from 'lodash/mapValues';
import { useLinkNaming } from 'modules/purchase-draft/hooks/projections/useLinkNaming';
import { describeLinkDrift } from 'modules/purchase-draft/utils/link-drift';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

export type DriftBullet = { key: string; text: string };

/**
 * One sentence per comparison the whole draft reports, as the approved frame
 * writes them (`F0SpRx` node `G5PCcB`, AC-16):
 *
 * > Nordwind Logistik GmbH — quantity raised from 800 to 1 000 on 25 Aug, still
 * > needed by 2 Sep 2026.
 * > Baltic Freight OÜ — cancelled on 24 Aug. Line 1 was linked to it for 400.
 *
 * **The bullet is dated.** The day the linked Customer Order moved is part of
 * the comparison the frame draws, in the short form (`25 Aug`) the surrounding
 * sentence establishes the year for. An order carrying no such moment — one
 * never changed since it was recorded — reads the undated variant of the same
 * sentence rather than one with a date-shaped hole in it.
 *
 * AC-16 asks the system to name "the Customer Order and what changed, compared
 * against the demand captured when the draft was frozen" — so a bullet states
 * both halves of the comparison, and the sentence is one parameterized key
 * rather than fragments concatenated at the render site.
 *
 * A cancellation and a fulfilment name the line and the quantity that was
 * intended for that customer instead of a before/after pair, because there is
 * no "after" to compare against: what the reader needs is how much of their
 * order was riding on this draft.
 */
export const useDriftBullets = (): ((
  draft: PurchaseDraftDetail,
) => DriftBullet[]) => {
  const { t } = useTranslation('purchase-draft');
  const linkNaming = useLinkNaming();
  const { quantity, shortCalendarDate, shortTimestampDate } = useLocaleFormat();

  return (draft) =>
    draft.lines.flatMap((line, index) =>
      line.links.flatMap((link) =>
        describeLinkDrift(link, line.deliveryMode).map((drift) => ({
          key: `${link.id}-${drift.kind}`,
          text: t(`detail.driftAlert.${drift.kind}`, {
            // The moment selects the `…_dated` wording through i18next's own
            // context suffix; without one the plain sentence stands.
            context: drift.changedAt === null ? undefined : 'dated',
            customer: linkNaming(link),
            line: index + 1,
            on:
              drift.changedAt === null
                ? ''
                : shortTimestampDate(drift.changedAt),
            quantity: quantity(link.statedQuantity),
            ...mapValues(drift.quantities, quantity),
            // `F0SpRx.png` writes these short — "still needed by 2 Sep" — because
            // the sentence already carries a dated clause and two full dates in
            // one bullet read as a coincidence rather than a comparison.
            ...mapValues(drift.dates, shortCalendarDate),
            // Unformatted, for the same reason the chip leaves it alone: an
            // address has no locale form (AC-18).
            ...drift.addresses,
          }),
        })),
      ),
    );
};
