// T12 — `ListPurchaseDraftLinesQuery` choosing the condition account's four shapes and building
// each into the nested shape openapi.yaml's `PurchaseDraftLineEnding.condition` requires, mirroring
// `read-purchase-draft-condition.query.spec.ts` for the by-line read (AC-21, AC-22, AC-23a,
// sad.md §6.3).
import { PermissionId } from '@warehouser/shared-types/enums';
import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service.js';
import { ListPurchaseDraftLinesQuery } from 'purchase-drafts/usecases/queries/list-purchase-draft-lines.query.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { describe, expect, it, vi } from 'vitest';

const warehouseId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';

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

const endingWithCause = {
  kind: 'arrival',
  quantity: 100,
  recordedByUserId: actorId,
  recordedAt: '2026-09-01T08:00:00.000Z',
  acceptedQuantity: 92,
  rejectedQuantity: 8,
  preReceiptConformance: conformance,
  rejections: [
    {
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
    },
  ],
};

const endingCauseWithheld = {
  kind: 'arrival',
  quantity: 100,
  recordedByUserId: actorId,
  recordedAt: '2026-09-01T08:00:00.000Z',
  acceptedQuantity: 92,
  rejectedQuantity: 8,
  preReceiptConformance: conformance,
};

const entryWith = (ending: unknown) => ({
  purchaseDraftId: '00000000-0000-4000-8000-000000000301',
  purchaseDraftReference: 'PD-0143',
  purchaseDraftState: 'closed',
  expectedArrivalDate: null,
  line: {
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
});

const repositoryDouble = () => ({
  listIdentifiedLines: vi
    .fn()
    .mockImplementation(
      (_warehouseId: string, _filters?: unknown, cause?: string) =>
        Promise.resolve([
          entryWith(
            cause === 'cause_withheld' ? endingCauseWithheld : endingWithCause,
          ),
        ]),
    ),
  listRedactedLines: vi
    .fn()
    .mockImplementation(
      (_warehouseId: string, _filters?: unknown, cause?: string) =>
        Promise.resolve([
          entryWith(
            cause === 'cause_withheld' ? endingCauseWithheld : endingWithCause,
          ),
        ]),
    ),
});

// AC-23a — mirrors `read-purchase-draft-condition.query.spec.ts`'s catalogue double: a wording that
// differs from the fixture's `rejectionReasonId`, so an assertion on `rejectionReasonLabel` can only
// pass if the query actually resolved it.
const catalogueDouble = () => ({
  resolveRejectionReasons: vi.fn().mockResolvedValue([
    {
      id: 'damaged_in_transit',
      label: 'Damaged in transit',
      requiresDescription: false,
    },
  ]),
});

const endingOf = (entries: unknown) =>
  (entries as { line: { ending: Record<string, unknown> } }[])[0]?.line.ending;

const conditionOf = (entries: unknown): Record<string, unknown> | null =>
  endingOf(entries).condition as Record<string, unknown> | null;

describe('ListPurchaseDraftLinesQuery — the condition account’s four shapes (AC-21, AC-22)', () => {
  it('reads the full account for an actor holding both REJECTIONS:WATCH and CUSTOMERS:WATCH', async () => {
    const repository = repositoryDouble();
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(
      userWith(PermissionId.REJECTIONS_WATCH, PermissionId.CUSTOMERS_WATCH),
      {},
    );

    expect(repository.listIdentifiedLines).toHaveBeenCalledWith(
      warehouseId,
      {},
      'with_cause',
    );
    const condition = conditionOf(result);
    expect(condition).toHaveProperty('rejections');

    const rejections = condition?.rejections as
      Record<string, unknown>[] | undefined;

    expect(rejections?.[0]).toHaveProperty(
      'rejectionReasonLabel',
      'Damaged in transit',
    );
  });

  it('withholds the cause but keeps identity for an actor holding CUSTOMERS:WATCH alone', async () => {
    const repository = repositoryDouble();
    const catalogue = catalogueDouble();
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogue as never),
    );

    const result = await query.execute(
      userWith(PermissionId.CUSTOMERS_WATCH),
      {},
    );

    expect(repository.listIdentifiedLines).toHaveBeenCalledWith(
      warehouseId,
      {},
      'cause_withheld',
    );
    expect(conditionOf(result)).not.toHaveProperty('rejections');
    // No timing channel: a withheld read never resolves a Reason, because it never names one.
    expect(catalogue.resolveRejectionReasons).not.toHaveBeenCalled();
  });

  it('keeps the cause but withholds identity for an actor holding REJECTIONS:WATCH alone', async () => {
    const repository = repositoryDouble();
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(
      userWith(PermissionId.REJECTIONS_WATCH),
      {},
    );

    expect(repository.listRedactedLines).toHaveBeenCalledWith(
      warehouseId,
      {},
      'with_cause',
    );
    expect(conditionOf(result)).toHaveProperty('rejections');
  });

  it('withholds both the cause and the identity for an actor holding neither observed Permission', async () => {
    const repository = repositoryDouble();
    const catalogue = catalogueDouble();
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogue as never),
    );

    const result = await query.execute(baseUser, {});

    expect(repository.listRedactedLines).toHaveBeenCalledWith(
      warehouseId,
      {},
      'cause_withheld',
    );
    expect(conditionOf(result)).not.toHaveProperty('rejections');
    // No timing channel: a withheld read never resolves a Reason, because it never names one.
    expect(catalogue.resolveRejectionReasons).not.toHaveBeenCalled();
  });

  it("omits 'rejections' as a property in the withheld shape — not empty, not null", async () => {
    const repository = repositoryDouble();
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const result = await query.execute(baseUser, {});

    const condition = conditionOf(result) as Record<string, unknown>;
    expect('rejections' in condition).toBe(false);
    expect(condition.rejections).toBe(undefined);
  });

  it('does not name the withheld columns on the query it issues for the withheld shape', async () => {
    const repository = repositoryDouble();
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    await query.execute(baseUser, { deliveryMode: 'via_warehouse' });

    // The use case proves this by the argument it hands the repository, not by fetching the
    // columns and deleting them: the repository's `cause_withheld` query (T6) is what actually
    // avoids naming the withheld columns in SQL.
    expect(repository.listRedactedLines).toHaveBeenCalledWith(
      warehouseId,
      { deliveryMode: 'via_warehouse' },
      'cause_withheld',
    );
  });

  // AC-23a — resolved **once** for the whole page, never once per line: a two-entry page that both
  // name Rejections must still cost one catalogue read, not two.
  it('resolves the Rejection Reason catalogue exactly once for a multi-line with-cause page', async () => {
    const catalogue = catalogueDouble();
    const [firstEntry] = await repositoryDouble().listIdentifiedLines(
      warehouseId,
      {},
      'with_cause',
    );
    const repository = repositoryDouble();
    repository.listIdentifiedLines.mockResolvedValue([
      firstEntry,
      { ...firstEntry, line: { ...firstEntry.line, id: 'line-2' } },
    ]);
    const query = new ListPurchaseDraftLinesQuery(
      repository as never,
      new RejectionReasonLabelService(catalogue as never),
    );

    await query.execute(
      userWith(PermissionId.REJECTIONS_WATCH, PermissionId.CUSTOMERS_WATCH),
      {},
    );

    expect(catalogue.resolveRejectionReasons).toHaveBeenCalledTimes(1);
  });
});
