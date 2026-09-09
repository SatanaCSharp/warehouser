import uniq from 'lodash/uniq';
import type {
  PurchaseDraftLineEndingRead,
  PurchaseDraftLineRejectionRead,
} from 'shared/domain/repositories/purchase-draft-read.repository';

// The types below are **feature-owned**, not transport shapes. This is a `domain/mappers/` file, so
// what it produces is the ending as this feature's application boundary knows it
// (server-architecture.md § "Layer responsibilities → Domain": "Mappings between shared persistence
// entities and feature-owned domain objects belong in `<feature-name>/domain/mappers/`"). Assembling
// the contract's `PurchaseDraftLineEnding`/`LineCondition` out of these is the REST boundary's job
// and lives in `purchase-drafts/rest/purchase-draft-response.ts`, beside every other `to*Response`
// (server-architecture.md § REST). Field names and semantics are deliberately the contract's, so
// the translation at the boundary is a rename-free one; the domain owning the type is what keeps
// the wire shape from being built inward.

// The supplier's frozen instruction judged, as the repository read it back. `verdict` is a plain
// string here: narrowing it to the contract's enum is a transport concern, and this layer neither
// widens nor validates it.
export interface LineConformanceVerdict {
  readonly verdict: string;
  readonly note: string | null;
}

// One quantity of a line's arrival the Warehouse refused, with its Reason's current wording joined
// in (AC-21, AC-23a). `source` and `disposition` stay strings for the same reason `verdict` does.
export interface LineRejection {
  readonly id: string;
  readonly rejectionReasonId: string;
  readonly rejectionReasonLabel: string;
  readonly quantity: number;
  readonly source: string;
  readonly description: string | null;
  readonly disposition: string;
  readonly raisedByUserId: string;
  readonly raisedAt: string;
  readonly amendedByUserId: string | null;
  readonly amendedAt: string | null;
}

// AC-22/sad.md §10 "Redaction unit" — the condition account read **without** `REJECTIONS:WATCH`:
// ordered, presented, accepted and the one total refused figure, and no `rejections` property at
// all.
export interface LineConditionCauseWithheld {
  readonly acceptedQuantity: number;
  readonly rejectedQuantity: number;
  readonly preReceiptConformance: LineConformanceVerdict;
}

// AC-21 — the same account read **with** `REJECTIONS:WATCH`, every refused quantity beside its
// cause.
export interface LineConditionWithCause extends LineConditionCauseWithheld {
  readonly rejections: readonly LineRejection[];
}

// The two forms as a union rather than as one shape with an emptied array, mirroring
// `PurchaseDraftLineEndingRead`'s own union: in the withheld form `rejections` is **absent as a
// property**, because the repository never selected the columns carrying it. TypeScript then
// enforces the same boundary the SQL does, and the REST boundary reads the presence of `rejections`
// as the one discriminator between the contract's two `LineCondition` forms — so a withheld read
// cannot leak a cause it never fetched.
export type LineConditionAccount =
  LineConditionCauseWithheld | LineConditionWithCause;

// openapi.yaml `PurchaseDraftLineEnding` — the ending as this feature serves it, with its condition
// account nested under `condition` (AC-21, AC-22). The repository hands back the ending's own
// columns and the condition's figures **flat**, spliced together in one `json_build_object`
// (sad.md §6.3); nesting them is this mapping's own business decision, invoked from a use case above
// the repository boundary.
export interface PurchaseDraftLineEndingWithCondition {
  readonly kind: string;
  readonly quantity: number;
  readonly recordedByUserId: string;
  readonly recordedAt: string;
  readonly condition: LineConditionAccount | null;
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
): LineRejection => ({
  id: rejection.id,
  rejectionReasonId: rejection.rejectionReasonId,
  rejectionReasonLabel:
    rejectionReasonLabels.get(rejection.rejectionReasonId) ??
    rejection.rejectionReasonId,
  quantity: rejection.quantity,
  source: rejection.source,
  description: rejection.description,
  disposition: rejection.disposition,
  raisedByUserId: rejection.raisedByUserId,
  raisedAt: rejection.raisedAt,
  amendedByUserId: rejection.amendedByUserId,
  amendedAt: rejection.amendedAt,
});

// AC-21/AC-22/sad.md §10 "Redaction unit" — the condition account this line's ending carries, built
// from the repository's flat columns rather than routed through unchanged. `preReceiptConformance`
// being `null` is the discriminator `purchase-draft-read.repository.ts` hands up explicitly for the
// absent case — a line where nothing was received, or whose ending predates this release and was
// never backfilled (AC-04a) — and naming what that means is this layer's business decision, not the
// repository's.
export const conditionOf = (
  ending: PurchaseDraftLineEndingRead,
  rejectionReasonLabels: ReadonlyMap<string, string>,
): LineConditionAccount | null => {
  if (ending.preReceiptConformance === null) {
    return null;
  }

  const withheld: LineConditionCauseWithheld = {
    acceptedQuantity: ending.acceptedQuantity,
    rejectedQuantity: ending.rejectedQuantity,
    preReceiptConformance: {
      verdict: ending.preReceiptConformance.verdict,
      note: ending.preReceiptConformance.note,
    },
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
// nested. `null` passes straight through: a line with no ending at all has no condition to build
// either.
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
