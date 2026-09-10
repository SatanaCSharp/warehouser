import type { PurchaseDraftLineLink } from '@warehouser/contracts/purchase-drafts';
import { purchaseDraftLinkIdentity } from 'modules/purchase-draft/utils/link-identity';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export type PurchaseDraftLinkNaming = (link: PurchaseDraftLineLink) => string;

/**
 * What a **sentence about** one Purchase Draft Line link calls its customer:
 * the unlink control's accessible name, the arrival dialog's per-row assign
 * label, the drift bullet's subject, and the bullets a refusal lists.
 *
 * It is not what the row draws. The row's own presentation is
 * `PurchaseDraftLinkIdentity`, which says "customer identity withheld" as a
 * statement in its own right (AC-09a); a sentence interpolating that statement
 * as a name would not read as English. This projection therefore answers with
 * the noun phrase such a sentence needs, and — like the cell — never with a
 * blank, which would leave a member reading "Unlink" and a refusal naming
 * nobody.
 *
 * It is stable per language, so a caller may key a memo on it and rebuild
 * exactly when the copy it produces changes.
 */
export const useLinkNaming = (): PurchaseDraftLinkNaming => {
  const { t } = useTranslation('purchase-draft');

  return useCallback(
    (link: PurchaseDraftLineLink): string =>
      purchaseDraftLinkIdentity(link).name ?? t('linkRow.withheldName'),
    [t],
  );
};
