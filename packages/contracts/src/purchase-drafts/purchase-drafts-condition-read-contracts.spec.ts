// T12 — the four-shape condition projection (contracts/openapi.yaml `LineCondition`,
// `LineConditionWithCause`, `LineConditionCauseWithheld`, `PurchaseDraftLineRejection`,
// `PreReceiptConformance`, and `PurchaseDraftLineEnding.condition`). None of these five exports
// exist on this branch yet — `purchaseDraftLineEndingSchema` today has no `condition` property at
// all (T9's write-side condition payload landed; this file's read-side union has not) — so every
// import below fails to resolve and the whole suite reports "Cannot find module" (GOOD red).
//
// sad.md §6.3 / §10 "Redaction unit": the line has **four** legal shapes crossed against
// `CUSTOMERS:WATCH` (tested in `purchase-drafts-contracts.spec.ts`'s existing `PurchaseDraftLine`
// union) and `REJECTIONS:WATCH` (tested here). A matrix covering only two of the four leaves half
// the projection unproven.
import {
  lineConditionCauseWithheldSchema,
  lineConditionSchema,
  lineConditionWithCauseSchema,
  preReceiptConformanceSchema,
  purchaseDraftLineEndingSchema,
  purchaseDraftLineRejectionSchema,
} from 'purchase-drafts';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const validRejection = {
  id: id(601),
  rejectionReasonId: 'damaged_in_transit',
  rejectionReasonLabel: 'Damaged in transit',
  quantity: 8,
  source: 'inspected',
  description: null,
  disposition: 'undecided',
  raisedByUserId: id(1),
  raisedAt: '2026-09-01T08:00:00.000Z',
  amendedByUserId: null,
  amendedAt: null,
};

const validConformance = {
  verdict: 'met',
  note: null,
};

const validWithCause = {
  acceptedQuantity: 92,
  rejectedQuantity: 8,
  preReceiptConformance: validConformance,
  rejections: [validRejection],
};

const validCauseWithheld = {
  acceptedQuantity: 92,
  rejectedQuantity: 8,
  preReceiptConformance: validConformance,
};

describe('PurchaseDraftLineRejection (openapi.yaml `PurchaseDraftLineRejection`) — AC-21', () => {
  it('accepts one recorded refusal beside its Reason, description, Source and Disposition', () => {
    expect(purchaseDraftLineRejectionSchema.parse(validRejection)).toEqual(
      validRejection,
    );
  });

  it.each([
    'id',
    'rejectionReasonId',
    'rejectionReasonLabel',
    'quantity',
    'source',
    'description',
    'disposition',
    'raisedByUserId',
    'raisedAt',
    'amendedByUserId',
    'amendedAt',
  ] as const)('requires %s, even when null-shaped', (field) => {
    const { [field]: removed, ...withoutField } = validRejection;

    expect(removed).not.toBe(undefined);
    expect(
      purchaseDraftLineRejectionSchema.safeParse(withoutField).success,
    ).toBe(false);
  });

  it('refuses an unknown property', () => {
    expect(
      purchaseDraftLineRejectionSchema.safeParse({
        ...validRejection,
        supplierName: 'Acme Supplies',
      }).success,
    ).toBe(false);
  });
});

describe('PreReceiptConformance (openapi.yaml `PreReceiptConformance`) — AC-15, AC-15a', () => {
  it('accepts the three verdicts, each with the note shape it admits', () => {
    expect(preReceiptConformanceSchema.parse(validConformance)).toEqual(
      validConformance,
    );
    expect(
      preReceiptConformanceSchema.parse({
        verdict: 'not_met',
        note: 'Packaging not as instructed',
      }),
    ).toEqual({ verdict: 'not_met', note: 'Packaging not as instructed' });
    expect(
      preReceiptConformanceSchema.parse({
        verdict: 'not_applicable',
        note: null,
      }),
    ).toEqual({ verdict: 'not_applicable', note: null });
  });

  it('requires both properties present, note included as an explicit null', () => {
    expect(
      preReceiptConformanceSchema.safeParse({ verdict: 'met' }).success,
    ).toBe(false);
    expect(preReceiptConformanceSchema.safeParse({ note: null }).success).toBe(
      false,
    );
  });

  it('refuses a verdict outside the three the system offers', () => {
    expect(
      preReceiptConformanceSchema.safeParse({
        verdict: 'partially_met',
        note: null,
      }).success,
    ).toBe(false);
  });
});

// ---- AC-21/AC-22/sad.md §10 "Redaction unit": one test per shape, four per line-bearing read ----
describe('LineCondition — the four-shape condition account (openapi.yaml `LineCondition`)', () => {
  it('LineConditionWithCause carries every refused quantity beside its Reason, description, Source, Disposition, ordered, presented, accepted and rejected (AC-21)', () => {
    expect(lineConditionWithCauseSchema.parse(validWithCause)).toEqual(
      validWithCause,
    );
    const [rejection] =
      lineConditionWithCauseSchema.parse(validWithCause).rejections;
    expect(rejection).toEqual(validRejection);
  });

  it('LineConditionCauseWithheld carries the one total refused figure, which is what keeps a refusal visible (AC-22)', () => {
    const parsed = lineConditionCauseWithheldSchema.parse(validCauseWithheld);

    expect(parsed.acceptedQuantity).toBe(92);
    expect(parsed.rejectedQuantity).toBe(8);
  });

  // The load-bearing assertion: absent, not empty and not null. `additionalProperties: false` is
  // what turns a leaked `rejections` array into a contract violation on the way out rather than a
  // rendering artefact a screen must additionally hide (spec.md §6.1, sad.md §8).
  it("omits 'rejections' as a property from the withheld shape — not an empty array, not null", () => {
    const parsed: object =
      lineConditionCauseWithheldSchema.parse(validCauseWithheld);

    expect('rejections' in parsed).toBe(false);
  });

  it('refuses a withheld payload that still carries a rejections array, an amendment or a Reason', () => {
    expect(
      lineConditionCauseWithheldSchema.safeParse({
        ...validCauseWithheld,
        rejections: [validRejection],
      }).success,
    ).toBe(false);
  });

  // No Reason, description, Disposition, count, badge or placeholder survives, and nothing hints
  // that anything was withheld: the withheld shape of two lines that differ only in their real,
  // unreadable cause is identical once the two derived figures are set aside (spec.md §6.1 abuse
  // cases — "a placeholder is itself a disclosure that can be probed").
  it('renders two withheld lines with different unreadable causes as indistinguishable except for their figures', () => {
    const causeA = lineConditionCauseWithheldSchema.parse({
      acceptedQuantity: 92,
      rejectedQuantity: 8,
      preReceiptConformance: validConformance,
    });
    const causeB = lineConditionCauseWithheldSchema.parse({
      acceptedQuantity: 60,
      rejectedQuantity: 40,
      preReceiptConformance: { verdict: 'not_met', note: 'Wrong item' },
    });

    const {
      acceptedQuantity: acceptedA,
      rejectedQuantity: rejectedA,
      ...restA
    } = causeA;
    const {
      acceptedQuantity: acceptedB,
      rejectedQuantity: rejectedB,
      ...restB
    } = causeB;

    expect(Object.keys(restA).sort()).toEqual(Object.keys(restB).sort());
    expect(acceptedA).not.toBe(acceptedB);
    expect(rejectedA).not.toBe(rejectedB);
  });

  it('LineCondition is `oneOf` the two forms, disjoint by the presence of `rejections`', () => {
    expect(lineConditionSchema.parse(validWithCause)).toHaveProperty(
      'rejections',
    );
    expect('rejections' in lineConditionSchema.parse(validCauseWithheld)).toBe(
      false,
    );
  });
});

describe('PurchaseDraftLineEnding.condition (openapi.yaml `PurchaseDraftLineEnding`) — AC-04a, AC-21, AC-22', () => {
  const validEnding = {
    kind: 'arrival',
    quantity: 100,
    recordedByUserId: id(1),
    recordedAt: '2026-09-01T08:00:00.000Z',
    condition: validWithCause,
  };

  it('accepts an ending carrying the full condition account', () => {
    expect(purchaseDraftLineEndingSchema.parse(validEnding)).toEqual(
      validEnding,
    );
  });

  it('accepts an ending carrying the withheld condition account', () => {
    expect(
      purchaseDraftLineEndingSchema.parse({
        ...validEnding,
        condition: validCauseWithheld,
      }).condition,
    ).toEqual(validCauseWithheld);
  });

  // AC-04a / spec.md §8 tenth question — `null` in exactly two cases that read alike: nothing was
  // received, or the ending predates this release and was never backfilled.
  it('accepts `null` for a line where nothing was received or whose ending predates this release', () => {
    expect(
      purchaseDraftLineEndingSchema.parse({ ...validEnding, condition: null })
        .condition,
    ).toBeNull();
  });

  it('now requires `condition` as a property — a pre-arrival-inspection ending payload is refused', () => {
    const withoutCondition: Record<string, unknown> = { ...validEnding };
    delete withoutCondition.condition;

    expect(
      purchaseDraftLineEndingSchema.safeParse(withoutCondition).success,
    ).toBe(false);
  });
});
