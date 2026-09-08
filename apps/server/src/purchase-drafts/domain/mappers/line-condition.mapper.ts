import type {
  LineCondition,
  PreReceiptConformance,
  PurchaseDraftLineRejection,
} from '@warehouser/contracts/purchase-drafts';
import uniq from 'lodash/uniq';
import type {
  PurchaseDraftLineEndingRead,
  PurchaseDraftLineRejectionRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';

// openapi.yaml `PurchaseDraftLineEnding` — the ending as this feature serves it, with its condition
// account nested under `condition` exactly as the contract models it (AC-21, AC-22). The
// repository hands back the ending's own columns and the condition's figures **flat**, spliced
// together in one `json_build_object` (sad.md §6.3); nesting them into the shape the contract
// requires is this mapping's own business decision, invoked from a use case above the repository
// boundary (server-architecture.md § "Mappings between shared persistence entities and
// feature-owned domain objects").
export interface PurchaseDraftLineEndingWithCondition {
  readonly kind: string;
  readonly quantity: number;
  readonly recordedByUserId: string;
  readonly recordedAt: string;
  readonly condition: LineCondition | null;
}

// The identifiers named by every Rejection of every ending this read carries, deduplicated — what
// the caller resolves through `RejectionReasonCatalogueRepository.listRejectionReasons()` /
// `resolveRejectionReasons()` **once** for the whole draft or the whole by-line page, rather than
// once per line. Endings withholding the cause, and endings with no Condition Split at all, name
// no Rejection and contribute nothing.
export const rejectionReasonIdsOf = (
  endings: ReadonlyArray<PurchaseDraftLineEndingRead | null>,
): string[] =>
  uniq(
    endings.flatMap((ending) =>
      // Several read-side fixtures/callers omit `ending` entirely rather than stating `null`, and
      // both mean the same thing here — nothing to resolve a Reason for.
      ending !== null && ending !== undefined && 'rejections' in ending
        ? ending.rejections.map((rejection) => rejection.rejectionReasonId)
        : [],
    ),
  );

// A Rejection's Reason travels from the repository as an **identifier** (T6): the catalogue is
// extended only and no entry is ever reworded, so the current wording is joined in here rather than
// copied onto the row, which is what makes AC-23a hold by construction. `rejectionReasonId` carries
// `fk_purchase_draft_line_rejections_reason`, so the catalogue always has a row for it; the map
// this is handed is built from exactly the identifiers `rejectionReasonIdsOf` collected.
//
// Every property is **named rather than spread** — `purchase-draft-response.ts`'s rule for this
// same feature applies here too: `PurchaseDraftLineRejectionRead` is confidential-adjacent
// (`api-sync-report.md` records `warehouse_id`, `delivery_mode` and `updated_at` as columns
// deliberately given no field), and nothing on the server `safeParse`s an outgoing response. A
// spread would let a column added to the read later travel straight through this mapping into a
// response that has no Permission for it.
export const withRejectionReasonLabel = (
  rejection: PurchaseDraftLineRejectionRead,
  rejectionReasonLabels: ReadonlyMap<string, string>,
): PurchaseDraftLineRejection => ({
  id: rejection.id,
  rejectionReasonId: rejection.rejectionReasonId,
  rejectionReasonLabel:
    rejectionReasonLabels.get(rejection.rejectionReasonId) ??
    rejection.rejectionReasonId,
  quantity: rejection.quantity,
  source: rejection.source as PurchaseDraftLineRejection['source'],
  description: rejection.description,
  disposition:
    rejection.disposition as PurchaseDraftLineRejection['disposition'],
  raisedByUserId: rejection.raisedByUserId,
  raisedAt: rejection.raisedAt,
  amendedByUserId: rejection.amendedByUserId,
  amendedAt: rejection.amendedAt,
});

// AC-21/AC-22/sad.md §10 "Redaction unit" — the condition account this line's ending carries, built
// from the repository's flat columns rather than routed through unchanged. `preReceiptConformance`
// being `null` is the discriminator `purchase-draft-read.repository.ts` hands up explicitly for the
// absent case — a line where nothing was received, or whose ending predates this release and was
// never backfilled (AC-04a) — and naming what that means in the response is this layer's business
// decision, not the repository's.
export const conditionOf = (
  ending: PurchaseDraftLineEndingRead,
  rejectionReasonLabels: ReadonlyMap<string, string>,
): LineCondition | null => {
  if (ending.preReceiptConformance === null) {
    return null;
  }

  const withheld: LineCondition = {
    acceptedQuantity: ending.acceptedQuantity,
    rejectedQuantity: ending.rejectedQuantity,
    preReceiptConformance:
      ending.preReceiptConformance as PreReceiptConformance,
  };

  if (!('rejections' in ending)) {
    return withheld;
  }

  return {
    ...withheld,
    rejections: ending.rejections.map((rejection) =>
      withRejectionReasonLabel(rejection, rejectionReasonLabels),
    ),
  };
};

// The one place a repository's flat ending becomes the ending this feature serves, its condition
// nested exactly as the contract models it. `null` passes straight through: a line with no ending
// at all has no condition to build either.
export const withCondition = (
  ending: PurchaseDraftLineEndingRead | null,
  rejectionReasonLabels: ReadonlyMap<string, string>,
): PurchaseDraftLineEndingWithCondition | null =>
  ending === null || ending === undefined
    ? null
    : {
        kind: ending.kind,
        quantity: ending.quantity,
        recordedByUserId: ending.recordedByUserId,
        recordedAt: ending.recordedAt,
        condition: conditionOf(ending, rejectionReasonLabels),
      };
