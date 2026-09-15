import type { PurchaseDraftLineLink } from '@warehouser/contracts/purchase-drafts';
import type { PurchaseDraftLinkIdentityKind } from 'modules/purchase-draft/utils/link-identity';
import { purchaseDraftLinkIdentity } from 'modules/purchase-draft/utils/link-identity';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type PurchaseDraftLinkIdentityProps = {
  link: PurchaseDraftLineLink;
};

/**
 * Who one Purchase Draft Line link is for — the first line of `Ordering/Link
 * Row` (`BSmrU`) and of the arrival dialog's unassignable row, so both render
 * this one component and neither can present the identity differently from the
 * other.
 *
 * The three arms are the three ways identity reads
 * (`utils/link-identity.ts`), resolved to a **name** and rendered through a
 * total lookup, so a fourth can never be added without being given a style to
 * draw it in (`writing-web-components.md` §6):
 *
 * - **namedCustomer** — the Customer the linked order names, read live.
 * - **typedName** — the name typed onto an order that names no Customer.
 * - **withheld** — one statement and nothing else, identical for both kinds
 *   above, so a member without `CUSTOMERS:WATCH` cannot tell which kind a link
 *   is (AC-09a). No name, no address, and no second line to compare two rows
 *   by.
 *
 * The withheld arm is muted rather than merely unstyled, because it is a
 * statement about the reader's own entitlement and not a customer's name; the
 * distinction never rests on the colour alone, since the words themselves say
 * what is withheld (design-handoff.md §Accessibility).
 */
export const PurchaseDraftLinkIdentity = ({
  link,
}: PurchaseDraftLinkIdentityProps): ReactElement => {
  const { t } = useTranslation('purchase-draft');
  const identity = purchaseDraftLinkIdentity(link);

  // No empty-string fallback survives here: the withheld arm has no name to
  // fall back from, so it states that instead of leaving the slot blank.
  const name = identity.name ?? t('linkRow.withheld');

  const tone: Record<PurchaseDraftLinkIdentityKind, string> = {
    namedCustomer: 'text-foreground',
    typedName: 'text-foreground',
    withheld: 'text-muted',
  };

  return (
    <p className={`break-words font-medium ${tone[identity.kind]}`}>{name}</p>
  );
};
