import { Alert } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useDriftBullets } from 'modules/purchase-draft/hooks/projections/useDriftBullets';
import { useMinuteTimestamp } from 'modules/purchase-draft/hooks/projections/useMinuteTimestamp';
import { Conditional } from 'shared/components/Conditional';

import type { PurchaseDraftDetail } from '@warehouser/contracts/purchase-drafts';
import type { ReactElement } from 'react';

export type PurchaseDraftDriftAlertProps = {
  draft: PurchaseDraftDetail;
};

/**
 * The aggregate Drift Signal (design-handoff.md `F0SpRx` node `G5PCcB`,
 * AC-16): every linked Customer Order that moved, **stated as the comparison**
 * against the Demand Snapshot captured at the freeze, plus the line saying that
 * nothing else on the draft has changed or will.
 *
 * AC-16 asks the system to name the Customer Order *and what changed*, so a
 * bullet reads "quantity raised from 800 to 1 000, still needed by 2 Sep 2026",
 * not "this order's quantity changed" — both halves of every comparison are
 * already on the wire (`snapshot` and `current`), and reporting only that one
 * exists throws away the half the reader needs to decide what to do.
 *
 * The alert reports; it never offers a remedy. What to do about drift is
 * explicitly the member's decision, and the closing paragraph says so.
 */
export const PurchaseDraftDriftAlert = ({
  draft,
}: PurchaseDraftDriftAlertProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const driftBullets = useDriftBullets();
  const minuteTimestamp = useMinuteTimestamp();

  // The Demand Snapshot was captured at the freeze, so the moment the
  // comparison is made against is the moment the draft was readied. It is
  // resolved before the return rather than gated inline, because `Conditional`
  // evaluates both arms and formatting a moment that does not exist would throw
  // (`writing-web-conditional-components.md` §2).
  const capturedAt =
    draft.readiedAt === null
      ? undefined
      : t('detail.driftAlert.capturedAt', {
          timestamp: minuteTimestamp(draft.readiedAt),
        });

  return (
    <Alert role="alert" status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{t('detail.driftAlert.heading')}</Alert.Title>
        <Alert.Description>
          <Conditional when={capturedAt}>
            <p>{capturedAt}</p>
          </Conditional>
          <ul className="mt-2 list-disc pl-5">
            {driftBullets(draft).map(({ key, text }) => (
              <li key={key}>{text}</li>
            ))}
          </ul>
          <p className="mt-2">{t('detail.driftAlert.nothingChanged')}</p>
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
};
