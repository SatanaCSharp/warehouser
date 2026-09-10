// `purchase-drafts/domain/value-objects/line-condition.ts` does not exist yet (T7) — this is the
// RED for the value domains the Condition Split and the Pre-receipt Conformance are stated over:
// where a refusal came from (AC-24, AC-25), what the Warehouse decided became of the refused goods
// (AC-19), and how the goods measured against the frozen instruction (AC-15, AC-17, AC-17a).
//
// They are declared here rather than imported from `shared/domain/entities/...`:
// server-architecture.md §Domain forbids a domain value object importing a concrete persistence
// model, which is the same reason `delivery-mode.ts` re-declares its two literals. The type-level
// assignments below are what prove the two agree — a spec may import the persistence type freely.
import { DeliveryMode } from 'purchase-drafts/domain/value-objects/delivery-mode';
import {
  PreReceiptConformanceVerdict,
  REJECTION_DISPOSITIONS,
  RejectionDisposition,
  RejectionSource,
  requiredSourceFor,
} from 'purchase-drafts/domain/value-objects/line-condition';
import type { PurchaseDraftLinePreReceiptConformance } from 'shared/domain/entities/purchase-draft-line.entity';
import type {
  PurchaseDraftLineRejectionDisposition,
  PurchaseDraftLineRejectionSource,
} from 'shared/domain/entities/purchase-draft-line-rejection.entity';

describe('the line condition value domains', () => {
  // `chk_purchase_draft_line_rejections_source` — a refusal on goods that reached our own dock was
  // Inspected; only directly delivered goods carry a customer's report (AC-24, AC-25).
  it('names the two Sources with the values the column holds', () => {
    expect(RejectionSource.Inspected).toBe('inspected');
    expect(RejectionSource.CustomerReported).toBe('customer_reported');
  });

  // `chk_purchase_draft_line_rejections_disposition` — the four the column admits (AC-19).
  it('names the four Dispositions with the values the column holds', () => {
    expect(RejectionDisposition.Undecided).toBe('undecided');
    expect(RejectionDisposition.RefusedAtDelivery).toBe('refused_at_delivery');
    expect(RejectionDisposition.HeldForReturn).toBe('held_for_return');
    expect(RejectionDisposition.ScrappedOnSite).toBe('scrapped_on_site');
  });

  // AC-19 — "the system tells the member which dispositions are available", so the offered set is a
  // value the refusal can carry rather than a list rebuilt at each call site. openapi.yaml
  // `unknownDisposition` example fixes both the members and their order.
  it('offers the four Dispositions as the set AC-19’s refusal names', () => {
    expect(REJECTION_DISPOSITIONS).toEqual([
      'undecided',
      'refused_at_delivery',
      'held_for_return',
      'scrapped_on_site',
    ]);
  });

  // `chk_purchase_draft_lines_pre_receipt_conformance` — the three verdicts (AC-15, AC-17, AC-17a).
  it('names the three verdicts with the values the column holds', () => {
    expect(PreReceiptConformanceVerdict.Met).toBe('met');
    expect(PreReceiptConformanceVerdict.NotMet).toBe('not_met');
    expect(PreReceiptConformanceVerdict.NotApplicable).toBe('not_applicable');
  });

  // AC-25/`chk_purchase_draft_line_rejections_source_matches_mode` — the correspondence itself,
  // stated once as a lookup so both AC-25 and its mirror read the same fact, exactly as
  // `endingKindFor` states the ending correspondence. It is also what lets the refusal name the
  // `requiredSource` the openapi `source_mismatch` violation carries.
  it('requires the inspected Source of goods that came to our own dock', () => {
    expect(requiredSourceFor(DeliveryMode.ViaWarehouse)).toBe('inspected');
  });

  it('requires the customer-reported Source of directly delivered goods', () => {
    expect(requiredSourceFor(DeliveryMode.DirectToCustomer)).toBe(
      'customer_reported',
    );
  });

  // The domain literals and the persistence unions are the same strings, asserted in both
  // directions so drift breaks a build rather than a request.
  it('agrees with the columns in both directions', () => {
    const sourceToEntity: PurchaseDraftLineRejectionSource =
      RejectionSource.CustomerReported;
    const entityToSource: RejectionSource =
      'inspected' satisfies PurchaseDraftLineRejectionSource;
    const dispositionToEntity: PurchaseDraftLineRejectionDisposition =
      RejectionDisposition.HeldForReturn;
    const entityToDisposition: RejectionDisposition =
      'scrapped_on_site' satisfies PurchaseDraftLineRejectionDisposition;
    const verdictToEntity: PurchaseDraftLinePreReceiptConformance =
      PreReceiptConformanceVerdict.NotMet;
    const entityToVerdict: PreReceiptConformanceVerdict =
      'not_applicable' satisfies PurchaseDraftLinePreReceiptConformance;

    expect([
      sourceToEntity,
      entityToSource,
      dispositionToEntity,
      entityToDisposition,
      verdictToEntity,
      entityToVerdict,
    ]).toHaveLength(6);
  });
});
