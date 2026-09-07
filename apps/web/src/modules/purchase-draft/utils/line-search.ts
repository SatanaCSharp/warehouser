import type { PurchaseDraftLineListEntry } from '@warehouser/contracts/purchase-drafts';

/**
 * The text of one by-line row a search term is tested against (frame `zj46c`,
 * placeholder `Search lines, items or customers`): the draft that holds the
 * line, the Item it names, and — when the actor may read it — the Customer its
 * goods are going to.
 *
 * The customer is read from `customerDestination`, which the **redacted**
 * projection does not carry at all (`PurchaseDraftLineRedacted`, ADR 0001). An
 * actor without `CUSTOMERS:WATCH` therefore searches drafts and items only,
 * rather than probing for a name the read deliberately withheld — the filter
 * never sees text the projection did not give it.
 *
 * The Warehouse destination's address is deliberately not searched: it is the
 * same address on every dock-bound line, so it separates nothing, and its
 * access notes are confidential (spec.md §6.1).
 */
const searchableText = (entry: PurchaseDraftLineListEntry): string => {
  const customerName =
    'customerDestination' in entry.line
      ? (entry.line.customerDestination?.customerName ?? '')
      : '';

  return [
    entry.purchaseDraftReference,
    entry.line.itemSku,
    entry.line.itemDescription,
    customerName,
  ].join(' ');
};

/**
 * Whether one by-line row answers the destination's search term.
 *
 * The filter is **client-side over the lines the by-line read already
 * returned**, not a second server query: the read returns the Warehouse's
 * lines whole at this feature's stated scale, so a request carrying the term
 * would return exactly what is already in the client.
 *
 * An empty term matches everything, so a blank field is not a filter.
 */
export const matchesLineQuery = (
  query: string,
): ((entry: PurchaseDraftLineListEntry) => boolean) => {
  const needle = query.trim().toLocaleLowerCase();

  return (entry) =>
    needle === '' || searchableText(entry).toLocaleLowerCase().includes(needle);
};
