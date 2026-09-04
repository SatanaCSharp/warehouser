import { Alert } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { useLinkNaming } from 'modules/purchase-draft/hooks/projections/useLinkNaming';

import type { PurchaseDraftLine } from '@warehouser/contracts/purchase-drafts';
import type { DisagreeingDeliveryLink } from 'modules/purchase-draft/utils/delivery-disagreement';
import type { ReactElement } from 'react';

export type PurchaseDraftLineDeliveryRefusalAlertProps = {
  /** Every disagreeing link the last revision was refused for, or nothing while none has been reported. */
  disagreeingLinks?: DisagreeingDeliveryLink[];
  line: PurchaseDraftLine;
};

/**
 * AC-15a / sad.md §6.7 step 5 — revising a line's Delivery Mode or Delivery
 * Address is refused while any of its links disagrees with the destination
 * the revision would give it. **Every** disagreeing link is named and none
 * is withdrawn, because which one to remove is the member's decision — the
 * same treatment `EndingRefusalAlert` gives the Arrival Confirmation's own
 * broken bounds.
 *
 * A disagreeing link the draft in front of the member does not carry (a
 * stale read, a link removed since) names nothing and is dropped rather than
 * a bullet naming nobody.
 */
export const PurchaseDraftLineDeliveryRefusalAlert = ({
  disagreeingLinks,
  line,
}: PurchaseDraftLineDeliveryRefusalAlertProps): ReactElement | null => {
  const { t } = useTranslation('purchase-draft');
  const linkNaming = useLinkNaming();

  if (disagreeingLinks === undefined || disagreeingLinks.length === 0) {
    return null;
  }

  const customerNames = new Map(
    line.links.map((link) => [link.id, linkNaming(link)] as const),
  );

  const bullets = disagreeingLinks.flatMap((disagreement) => {
    const customer = customerNames.get(disagreement.purchaseDraftLineLinkId);

    return customer === undefined
      ? []
      : [{ id: disagreement.purchaseDraftLineLinkId, customer }];
  });

  return (
    <Alert className="mt-2" role="alert" status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{t('lineDelivery.refusal.heading')}</Alert.Title>
        <Alert.Description>
          <p>{t('lineDelivery.refusal.body')}</p>
          <ul className="mt-2 list-disc pl-5">
            {bullets.map(({ id, customer }) => (
              <li key={id}>{t('lineDelivery.refusal.bullet', { customer })}</li>
            ))}
          </ul>
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
};
