// T12 — `ReadPurchaseDraftQuery` choosing one of the condition account's **four** legal shapes from
// `observedPermissionIds`, crossed against the identity redaction `read-purchase-draft.query.spec.ts`
// already proves (ADR 0001, sad.md §6.3, §10 "Redaction unit"), and building that account into the
// shape openapi.yaml's `PurchaseDraftLineEnding.condition` requires — nested, with each Rejection's
// Reason label resolved from the catalogue — rather than routing the repository's flat columns
// straight through (AC-21, AC-23a). The repository
// (`purchase-draft-condition-read.repository.integration.spec.ts`, T6) already proves the real SQL
// selects nothing for the withheld shape; this spec proves the **choice** the use case makes — which
// repository method it calls and with which `cause` argument — and the **build** it performs on top
// of that choice.
import { PermissionId } from '@warehouser/shared-types/enums';
import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service.js';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { describe, expect, it, vi } from 'vitest';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const purchaseDraftId = '00000000-0000-4000-8000-000000000301';

const baseUser: AccessCurrentUser = {
  userId: actorId,
  warehouseId,
  roleId: '00000000-0000-4000-8000-000000000004',
  roleKind: 'custom',
  permissionId: 'PURCHASE_DRAFTS:WATCH',
  observedPermissionIds: [],
  archived: false,
};

const userWith = (
  ...observedPermissionIds: readonly PermissionId[]
): AccessCurrentUser => ({ ...baseUser, observedPermissionIds });

const conformance = { verdict: 'met', note: null };

// The full account, as the repository's `with_cause` query returns it: flat, with the Rejection
// naming its Reason by **identifier** alone — the catalogue's wording is this layer's job to join
// in, never the repository's (T6).
const rejection = {
  id: 'rejection-1',
  rejectionReasonId: 'damaged_in_transit',
  quantity: 8,
  source: 'inspected',
  description: null,
  disposition: 'undecided',
  raisedByUserId: actorId,
  raisedAt: '2026-09-01T08:00:00.000Z',
  amendedByUserId: null,
  amendedAt: null,
};

const endingWithCause = {
  kind: 'arrival',
  quantity: 100,
  recordedByUserId: actorId,
  recordedAt: '2026-09-01T08:00:00.000Z',
  acceptedQuantity: 92,
  rejectedQuantity: 8,
  preReceiptConformance: conformance,
  rejections: [rejection],
};

// The repository's `cause_withheld` query never selects the columns carrying `rejections`, so this
// object has no such property at all — the fixture matches what the repository actually returns.
const endingCauseWithheld = {
  kind: 'arrival',
  quantity: 100,
  recordedByUserId: actorId,
  recordedAt: '2026-09-01T08:00:00.000Z',
  acceptedQuantity: 92,
  rejectedQuantity: 8,
  preReceiptConformance: conformance,
};

const draftDetailWith = (ending: unknown) => ({
  id: purchaseDraftId,
  reference: 'PD-0143',
  state: 'closed',
  expectedArrivalDate: null,
  lineCount: 1,
  hasDriftSignal: false,
  hasDirectToCustomerAddressDrift: false,
  closureReason: null,
  createdByUserId: actorId,
  createdAt: '2026-08-12T08:00:00.000Z',
  readiedByUserId: actorId,
  readiedAt: '2026-08-14T09:00:00.000Z',
  closedByUserId: actorId,
  closedAt: '2026-09-01T09:00:00.000Z',
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  lines: [
    {
      id: 'line-1',
      itemId: 'item-1',
      itemSku: 'TEST-SKU-0001',
      itemDescription: 'Cable reel, 50m',
      unitOfMeasure: 'each',
      orderedQuantity: 100,
      packagingTypeId: null,
      valueAddingNote: null,
      ending,
      deliveryMode: 'via_warehouse',
      warehouseDestination: {
        addressText: 'Test Warehouse Dock, Test City',
        accessNotes: null,
        frozen: true,
      },
      links: [],
    },
  ],
});

// Both `readIdentifiedDraft` and `readRedactedDraft` are stubbed with the same `mockImplementation`,
// which answers by the `cause` argument alone — exactly the assertion each case below drives: the
// use case must choose that argument from `REJECTIONS:WATCH`, since the repository will not choose
// it for them.
const repositoryDouble = () => ({
  readIdentifiedDraft: vi
    .fn()
    .mockImplementation((_id: string, _warehouseId: string, cause?: string) =>
      Promise.resolve(
        draftDetailWith(
          cause === 'cause_withheld' ? endingCauseWithheld : endingWithCause,
        ),
      ),
    ),
  readRedactedDraft: vi
    .fn()
    .mockImplementation((_id: string, _warehouseId: string, cause?: string) =>
      Promise.resolve(
        draftDetailWith(
          cause === 'cause_withheld' ? endingCauseWithheld : endingWithCause,
        ),
      ),
    ),
});

// AC-23a — the catalogue double this layer resolves every Rejection's Reason label from. Its
// wording differs from the fixture's own `rejectionReasonId`, deliberately, so an assertion on the
// resolved `rejectionReasonLabel` can only pass if the query actually joined it in rather than
// echoing the identifier back.
const catalogueDouble = () => ({
  resolveRejectionReasons: vi.fn().mockResolvedValue([
    {
      id: 'damaged_in_transit',
      label: 'Damaged in transit',
      requiresDescription: false,
    },
  ]),
});

const endingOf = (detail: unknown) =>
  (detail as { lines: { ending: Record<string, unknown> }[] }).lines[0]?.ending;

const conditionOf = (detail: unknown): Record<string, unknown> | null =>
  endingOf(detail).condition as Record<string, unknown> | null;

describe('ReadPurchaseDraftQuery — the condition account’s four shapes (AC-21, AC-22)', () => {
  it('reads the full account for an actor holding both REJECTIONS:WATCH and CUSTOMERS:WATCH (cause and identity)', async () => {
    const repository = repositoryDouble();
    const catalogue = catalogueDouble();
    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(catalogue as never),
    );

    const result = await query.execute(
      userWith(PermissionId.REJECTIONS_WATCH, PermissionId.CUSTOMERS_WATCH),
      purchaseDraftId,
    );

    expect(repository.readIdentifiedDraft).toHaveBeenCalledWith(
      purchaseDraftId,
      warehouseId,
      'with_cause',
    );
    const condition = conditionOf(result);
    expect(condition).toHaveProperty('rejections');
    // AC-21/AC-23a — the account carries the current wording, resolved from the catalogue rather
    // than the bare identifier the repository names the Rejection with.
    const rejections = condition?.rejections as
      Record<string, unknown>[] | undefined;

    expect(rejections?.[0]).toHaveProperty(
      'rejectionReasonLabel',
      'Damaged in transit',
    );
  });

  it('withholds the cause but keeps identity for an actor holding CUSTOMERS:WATCH alone (cause only withheld)', async () => {
    const repository = repositoryDouble();
    const catalogue = catalogueDouble();
    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(catalogue as never),
    );

    const result = await query.execute(
      userWith(PermissionId.CUSTOMERS_WATCH),
      purchaseDraftId,
    );

    expect(repository.readIdentifiedDraft).toHaveBeenCalledWith(
      purchaseDraftId,
      warehouseId,
      'cause_withheld',
    );
    expect(conditionOf(result)).not.toHaveProperty('rejections');
    // No timing channel: a withheld read never resolves a Reason, because it never names one.
    expect(catalogue.resolveRejectionReasons).not.toHaveBeenCalled();
  });

  it('keeps the cause but withholds identity for an actor holding REJECTIONS:WATCH alone (identity only withheld)', async () => {
    const repository = repositoryDouble();
    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(
      userWith(PermissionId.REJECTIONS_WATCH),
      purchaseDraftId,
    );

    expect(repository.readRedactedDraft).toHaveBeenCalledWith(
      purchaseDraftId,
      warehouseId,
      'with_cause',
    );
    expect(conditionOf(result)).toHaveProperty('rejections');
  });

  it('withholds both the cause and the identity for an actor holding neither observed Permission', async () => {
    const repository = repositoryDouble();
    const catalogue = catalogueDouble();
    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(catalogue as never),
    );

    const result = await query.execute(baseUser, purchaseDraftId);

    expect(repository.readRedactedDraft).toHaveBeenCalledWith(
      purchaseDraftId,
      warehouseId,
      'cause_withheld',
    );
    expect(conditionOf(result)).not.toHaveProperty('rejections');
    // No timing channel: a withheld read never resolves a Reason, because it never names one.
    expect(catalogue.resolveRejectionReasons).not.toHaveBeenCalled();
  });

  // The load-bearing property assertion, independent of the call-argument checks above: whatever
  // path the query took, an actor lacking REJECTIONS:WATCH never sees the property at all —
  // 'rejections' in condition === false, not an empty array and not null (sad.md §10 "Redaction
  // unit"). Asserted on `condition`, the shape the contract nests it under, not on the flat ending
  // the repository happens to return.
  it("omits 'rejections' as a property in the withheld shape — not empty, not null", async () => {
    const repository = repositoryDouble();
    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(baseUser, purchaseDraftId);

    const condition = conditionOf(result) as Record<string, unknown>;
    expect('rejections' in condition).toBe(false);
    expect(condition.rejections).toBe(undefined);
  });

  // AC-22 — that a refusal happened stays visible in the withheld shape, because the one total
  // figure travels regardless: presented (`ending.quantity`) and accepted differ.
  it('still carries the one total refused figure in the withheld shape', async () => {
    const repository = repositoryDouble();
    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(baseUser, purchaseDraftId);

    const ending = endingOf(result);
    const condition = conditionOf(result) as Record<string, unknown>;
    expect(condition.rejectedQuantity).toBe(8);
    expect(condition.acceptedQuantity).toBe(92);
    expect(ending.quantity).toBe(100);
  });

  // spec.md §6.1 abuse cases — "a placeholder is itself a disclosure that can be probed": two lines
  // whose real, unreadable causes differ produce withheld shapes that agree on every property except
  // the two derived figures. No count, badge or placeholder distinguishes "one reason" from "three
  // reasons" refused.
  it('renders the withheld shape indistinguishable from another withheld line except for the figures', async () => {
    const repository = repositoryDouble();
    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const resultA = await query.execute(baseUser, purchaseDraftId);
    const conditionA = conditionOf(resultA) as Record<string, unknown>;

    const differentlyWithheld = {
      ...endingCauseWithheld,
      acceptedQuantity: 55,
      rejectedQuantity: 45,
      preReceiptConformance: { verdict: 'not_met', note: 'Wrong item' },
    };
    repository.readRedactedDraft.mockResolvedValueOnce(
      draftDetailWith(differentlyWithheld),
    );
    const resultB = await query.execute(baseUser, purchaseDraftId);
    const conditionB = conditionOf(resultB) as Record<string, unknown>;

    const {
      acceptedQuantity: acceptedA,
      rejectedQuantity: rejectedA,
      preReceiptConformance: conformanceA,
      ...restA
    } = conditionA;
    const {
      acceptedQuantity: acceptedB,
      rejectedQuantity: rejectedB,
      preReceiptConformance: conformanceB,
      ...restB
    } = conditionB;

    expect(Object.keys(restA).sort()).toEqual(Object.keys(restB).sort());
    expect(acceptedA).not.toBe(acceptedB);
    expect(rejectedA).not.toBe(rejectedB);
    // `preReceiptConformance` is a judgement about the supplier's instruction, not a Rejection's
    // cause (sad.md §4), so it is free to differ between two withheld lines without that
    // differing value leaking anything about the withheld cause — it is excluded from the
    // key-shape comparison above for exactly that reason, and asserted on directly here.
    expect(conformanceA).not.toEqual(conformanceB);
  });

  // A line whose ending predates this release, or on which nothing was received, has no Condition
  // Split at all — the absent case data-model.md's tenth-question answer describes. Neither observed
  // Permission changes anything about a line that carries no condition to withhold, and the contract
  // carries no property beside `condition` itself being `null` to say so (openapi.yaml
  // `PurchaseDraftLineEnding`).
  it.each([
    ['neither observed Permission', baseUser],
    ['REJECTIONS:WATCH observed', userWith(PermissionId.REJECTIONS_WATCH)],
  ])(
    "renders a pre-release ending's absent case unchanged by %s",
    async (_label, user) => {
      const noConditionEnding = {
        kind: 'arrival',
        quantity: 100,
        recordedByUserId: actorId,
        recordedAt: '2026-01-01T08:00:00.000Z',
        acceptedQuantity: 100,
        rejectedQuantity: 0,
        preReceiptConformance: null,
      };
      const repository = repositoryDouble();
      repository.readRedactedDraft.mockResolvedValue(
        draftDetailWith(noConditionEnding),
      );
      const query = new ReadPurchaseDraftQuery(
        repository as never,
        new RejectionReasonLabelService(catalogueDouble() as never),
      );

      const result = await query.execute(user, purchaseDraftId);

      const ending = endingOf(result);
      expect(ending.condition).toBeNull();
      // No separate `acceptedQuantity` travels for this case: `condition` being `null` means
      // accepted equals the one figure the ending itself carries.
      expect(ending.quantity).toBe(100);
    },
  );

  // AC-23a — resolved **once** for the whole draft, never once per line: a two-line draft that
  // both name Rejections must still cost one catalogue read, not two.
  it('resolves the Rejection Reason catalogue exactly once for a multi-line with-cause read', async () => {
    const catalogue = catalogueDouble();
    const baseDetail = draftDetailWith(endingWithCause);
    const twoLineDetail = {
      ...baseDetail,
      lineCount: 2,
      lines: [...baseDetail.lines, { ...baseDetail.lines[0], id: 'line-2' }],
    };
    const repository = repositoryDouble();
    repository.readIdentifiedDraft.mockResolvedValue(twoLineDetail);
    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(catalogue as never),
    );

    await query.execute(
      userWith(PermissionId.REJECTIONS_WATCH, PermissionId.CUSTOMERS_WATCH),
      purchaseDraftId,
    );

    expect(catalogue.resolveRejectionReasons).toHaveBeenCalledTimes(1);
  });
});
