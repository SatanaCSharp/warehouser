// T12 — the coupling test the review found missing: every fixture in this feature's other specs
// replicates the repository's own *flat* ending columns and asserts against that flat shape
// directly, and the contracts spec proves the schemas against hand-written objects that were never
// produced by any query. Nothing ran a query's actual output, mapped the way the REST layer maps
// it, through the schema the client parses responses with — which is exactly how a nesting defect
// (T12's original miss: the repository's flat `acceptedQuantity`/`rejectedQuantity`/
// `preReceiptConformance`/`rejections` columns reaching the response unnested, instead of under
// `ending.condition` as openapi.yaml models it) shipped past a fully green suite.
//
// This spec closes that gap: it drives `ReadPurchaseDraftQuery`/`ListPurchaseDraftLinesQuery` from
// repository doubles shaped exactly as `PurchaseDraftReadRepository` actually returns (flat
// condition columns, per T6), maps the result through the same `toDetailResponse`/
// `toLineListEntryResponse` the REST controllers call, and `safeParse`s that response against
// `purchaseDraftDetailSchema`/`purchaseDraftLineListEntrySchema` — the same schemas
// `apps/web/src/shared/api/client/api-client.ts` parses a served response with. It covers all four
// condition shapes (cause × identity) plus the absent case (AC-21, AC-22, AC-23a).
import {
  purchaseDraftDetailSchema,
  purchaseDraftLineListEntrySchema,
} from '@warehouser/contracts/purchase-drafts';
import { PermissionId } from '@warehouser/shared-types/enums';
import { RejectionReasonLabelService } from 'purchase-drafts/domain/services/rejection-reason-label.service';
import {
  toDetailResponse,
  toLineListEntryResponse,
} from 'purchase-drafts/rest/mappers/purchase-draft-response.mapper';
import { ListPurchaseDraftLinesQuery } from 'purchase-drafts/usecases/queries/list-purchase-draft-lines.query';
import { ReadPurchaseDraftQuery } from 'purchase-drafts/usecases/queries/read-purchase-draft.query';
import type { AccessCurrentUser } from 'shared/access/access-current-user';

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

// Exactly the flat shape `purchase-draft-read.repository.ts`'s `json_build_object` produces (T6):
// the condition's own figures spliced beside the ending's own columns, never nested.
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
      id: '00000000-0000-4000-8000-000000000901',
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

const endingAbsentCondition = {
  kind: 'arrival',
  quantity: 100,
  recordedByUserId: actorId,
  recordedAt: '2026-01-01T08:00:00.000Z',
  acceptedQuantity: 100,
  rejectedQuantity: 0,
  preReceiptConformance: null,
};

const lineWith = (ending: unknown) => ({
  id: '00000000-0000-4000-8000-000000000601',
  itemId: '00000000-0000-4000-8000-000000000701',
  itemSku: 'WH-100420',
  itemDescription: 'Pallet wrap, 500mm',
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
  customerDestination: null,
  links: [],
});

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
  createdAt: new Date('2026-08-12T08:00:00.000Z'),
  readiedByUserId: actorId,
  readiedAt: new Date('2026-08-14T09:00:00.000Z'),
  closedByUserId: actorId,
  closedAt: new Date('2026-09-01T09:00:00.000Z'),
  arrivalConfirmedByUserId: null,
  arrivalConfirmedAt: null,
  discardedByUserId: null,
  discardedAt: null,
  lines: [lineWith(ending)],
});

const lineListEntryWith = (ending: unknown) => ({
  purchaseDraftId,
  purchaseDraftReference: 'PD-0143',
  purchaseDraftState: 'closed',
  expectedArrivalDate: null,
  line: lineWith(ending),
});

// Answers by the `cause` argument alone, exactly as `purchase-draft-read.repository.ts` does —
// `readIdentifiedDraft`/`readRedactedDraft` both selected the same columns for the same `cause`, so
// one double serves both.
const repositoryDouble = () => ({
  readIdentifiedDraft: jest
    .fn()
    .mockImplementation((_id: string, _warehouseId: string, cause?: string) =>
      Promise.resolve(
        draftDetailWith(
          cause === 'cause_withheld' ? endingCauseWithheld : endingWithCause,
        ),
      ),
    ),
  readRedactedDraft: jest
    .fn()
    .mockImplementation((_id: string, _warehouseId: string, cause?: string) =>
      Promise.resolve(
        draftDetailWith(
          cause === 'cause_withheld' ? endingCauseWithheld : endingWithCause,
        ),
      ),
    ),
  listIdentifiedLines: jest
    .fn()
    .mockImplementation(
      (_warehouseId: string, _filters?: unknown, cause?: string) =>
        Promise.resolve([
          lineListEntryWith(
            cause === 'cause_withheld' ? endingCauseWithheld : endingWithCause,
          ),
        ]),
    ),
  listRedactedLines: jest
    .fn()
    .mockImplementation(
      (_warehouseId: string, _filters?: unknown, cause?: string) =>
        Promise.resolve([
          lineListEntryWith(
            cause === 'cause_withheld' ? endingCauseWithheld : endingWithCause,
          ),
        ]),
    ),
});

const catalogueDouble = () => ({
  resolveRejectionReasons: jest.fn().mockResolvedValue([
    {
      id: 'damaged_in_transit',
      label: 'Damaged in transit',
      requiresDescription: false,
    },
  ]),
});

describe('a served purchase-draft read parses against its own contract (AC-21, AC-22, AC-23a)', () => {
  // The four shapes cause × identity actually produces, each exercised through the real query and
  // the real REST mapper.
  it.each<[string, PermissionId[]]>([
    [
      'cause and identity',
      [PermissionId.REJECTIONS_WATCH, PermissionId.CUSTOMERS_WATCH],
    ],
    ['cause only withheld', [PermissionId.CUSTOMERS_WATCH]],
    ['identity only withheld', [PermissionId.REJECTIONS_WATCH]],
    ['both withheld', []],
  ])(
    'PurchaseDraftDetail (%s) parses against purchaseDraftDetailSchema',
    async (_label, observedPermissionIds) => {
      const query = new ReadPurchaseDraftQuery(
        repositoryDouble() as never,
        new RejectionReasonLabelService(catalogueDouble() as never),
      );

      const detail = await query.execute(
        userWith(...observedPermissionIds),
        purchaseDraftId,
      );

      const response = toDetailResponse(detail!);
      const parsed = purchaseDraftDetailSchema.safeParse(response);

      expect(parsed.success).toBe(true);
    },
  );

  it.each<[string, PermissionId[]]>([
    [
      'cause and identity',
      [PermissionId.REJECTIONS_WATCH, PermissionId.CUSTOMERS_WATCH],
    ],
    ['cause only withheld', [PermissionId.CUSTOMERS_WATCH]],
    ['identity only withheld', [PermissionId.REJECTIONS_WATCH]],
    ['both withheld', []],
  ])(
    'PurchaseDraftLineListEntry (%s) parses against purchaseDraftLineListEntrySchema',
    async (_label, observedPermissionIds) => {
      const query = new ListPurchaseDraftLinesQuery(
        repositoryDouble() as never,
        new RejectionReasonLabelService(catalogueDouble() as never),
      );

      const [entry] = await query.execute(userWith(...observedPermissionIds));

      const response = toLineListEntryResponse(entry);
      const parsed = purchaseDraftLineListEntrySchema.safeParse(response);

      expect(parsed.success).toBe(true);
    },
  );

  // The absent case: a line whose ending predates this release, or on which nothing was received.
  // Neither observed Permission changes it, and it must still parse — `condition: null` is a legal
  // member of the contract's `oneOf`.
  it('PurchaseDraftDetail with a pre-release ending’s absent condition parses against the contract', async () => {
    const repository = repositoryDouble();
    repository.readRedactedDraft.mockResolvedValue(
      draftDetailWith(endingAbsentCondition),
    );
    const query = new ReadPurchaseDraftQuery(
      repository as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );

    const detail = await query.execute(baseUser, purchaseDraftId);
    const response = toDetailResponse(detail!);
    const parsed = purchaseDraftDetailSchema.safeParse(response);

    expect(parsed.success).toBe(true);
    expect(response.lines[0]?.ending?.condition).toBeNull();
  });

  // The regression control: the flat shape the repository actually returns — condition's
  // figures spliced beside the ending's own columns rather than nested under `condition`
  // (T6's `json_build_object`) — is exactly what shipped past every other fixture in this
  // feature. Built from `toDetailResponse`'s own output so the header is the real, valid
  // ISO-string header the mapper produces; only the ending's own shape varies between the two
  // parses, which is what makes the discrimination trustworthy rather than an artefact of some
  // other property failing first.
  it('discriminates a flat ending from a nested one at the same, otherwise-valid header', async () => {
    const query = new ReadPurchaseDraftQuery(
      repositoryDouble() as never,
      new RejectionReasonLabelService(catalogueDouble() as never),
    );
    const detail = await query.execute(
      userWith(PermissionId.REJECTIONS_WATCH, PermissionId.CUSTOMERS_WATCH),
      purchaseDraftId,
    );
    const response = toDetailResponse(detail!);

    const nestedResult = purchaseDraftDetailSchema.safeParse(response);
    expect(nestedResult.success).toBe(true);

    const flatResponse = {
      ...response,
      lines: [{ ...response.lines[0], ending: endingWithCause }],
    };
    const flatResult = purchaseDraftDetailSchema.safeParse(flatResponse);

    expect(flatResult.success).toBe(false);
    expect(
      !flatResult.success &&
        flatResult.error.issues.some((issue) => issue.path[0] === 'lines'),
    ).toBe(true);
  });
});
