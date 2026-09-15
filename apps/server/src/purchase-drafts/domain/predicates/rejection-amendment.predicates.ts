import { isUndefined } from '@warehouser/utils/predicates';
import { isOfferedDisposition } from 'purchase-drafts/domain/predicates/purchase-draft-condition.predicates';
import type { RejectionDisposition } from 'purchase-drafts/domain/value-objects/line-condition';

// The condition `usecases/commands/amend-purchase-draft-rejection.command.ts` decides before it
// writes an amendment (server-error-handling.md §1).

// AC-19 — an amendment that states no Disposition states nothing to judge; one that states a
// Disposition states one the system offers.
export const dispositionOfferedOrUnstated = (
  disposition: string | undefined,
): disposition is RejectionDisposition | undefined =>
  isUndefined(disposition) || isOfferedDisposition(disposition);
