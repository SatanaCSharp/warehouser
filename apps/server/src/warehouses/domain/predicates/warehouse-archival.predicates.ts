import { isNull } from '@warehouser/utils/predicates';

/** Which of the two archival commands a request is asking for.
 *
 * `PATCH .../archived` carries one boolean and means two different writes, so the controller's
 * branch is a routing rule about the payload rather than a flag read. Named so the pairing with
 * `RestoreWarehouseCommand` is visible at the branch. */
export const requestsArchival = (input: {
  readonly archived: boolean;
}): boolean => input.archived;

/** AC-15 — whether archiving this Warehouse would leave the Workspace with none.
 *
 * Only a Warehouse that is not already archived can be the last unarchived one; re-archiving an
 * archived Warehouse changes the count by nothing and is refused by neither this nor anything else.
 */
export const isLastUnarchivedWarehouse = (
  archivedAt: Date | null,
  unarchivedCount: number,
): boolean => isNull(archivedAt) && unarchivedCount <= 1;
