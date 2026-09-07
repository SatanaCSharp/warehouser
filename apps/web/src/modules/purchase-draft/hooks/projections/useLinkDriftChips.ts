import mapValues from 'lodash/mapValues';
import { useTranslation } from 'react-i18next';

import { describeLinkDrift } from 'modules/purchase-draft/utils/link-drift';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

import type {
  DeliveryMode,
  PurchaseDraftLineLink,
} from '@warehouser/contracts/purchase-drafts';

/**
 * What each of a link's drift chips says — `Raised to 1 000 on 25 Aug`,
 * `Cancelled on 24 Aug`, `Needed by moved to 9 Sep 2026` (frame `F0SpRx`),
 * never a generic "Drift detected". A link that drifted in two ways carries two
 * chips, because each names a different value.
 *
 * The chip is the short form of the same comparison the aggregate alert states
 * in full, so both read `utils/link-drift.ts` rather than deriving it twice —
 * including its reading of what a moved Delivery Address means for the line's
 * own Delivery Mode, which is why the mode is passed alongside the link
 * (AC-18).
 *
 * **The chip is dated (AC-16).** The frame writes the day the linked Customer
 * Order moved into every chip, in the short form the dense row calls for
 * (`24 Aug`), because the comparison AC-16 asks for is not only what changed
 * but when. The date is a separate copy variant rather than a fragment appended
 * to the sentence: an order carrying no moment — one never changed since it was
 * recorded — reads the undated wording instead of trailing an empty
 * preposition, and each language keeps its own word order.
 */
export const useLinkDriftChips = (): ((
  link: PurchaseDraftLineLink,
  deliveryMode: DeliveryMode,
) => string[]) => {
  const { t } = useTranslation('purchase-draft');
  const { calendarDate, quantity, shortTimestampDate } = useLocaleFormat();

  return (link, deliveryMode) =>
    describeLinkDrift(link, deliveryMode).map((drift) =>
      t(`linkRow.drift.${drift.kind}`, {
        // i18next appends the context to the key, so a moment selects the
        // `…_dated` wording and its absence leaves the plain one — no branch
        // between two `t()` calls, and no key assembled by hand.
        context: drift.changedAt === null ? undefined : 'dated',
        on: drift.changedAt === null ? '' : shortTimestampDate(drift.changedAt),
        ...mapValues(drift.quantities, quantity),
        ...mapValues(drift.dates, calendarDate),
        // An address is text a member typed for a human driver to read: it has
        // no locale form to resolve, so it is interpolated exactly as recorded
        // rather than passed through a formatter (AC-18).
        ...drift.addresses,
      }),
    );
};
