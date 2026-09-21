import {
  ageBandSchema,
  archivedWarehouseCountSchema,
  arrivalTimingBucketKindSchema,
  urgencyBandSchema,
} from 'dashboards';
import { describe, expect, it } from 'vitest';

// T3 — the four vocabularies openapi.yaml's dashboards components introduce (`AgeBand`,
// `UrgencyBand`, `ArrivalTimingBucketKind`, `ArchivedWarehouseCount`), exercised as behaviour
// rather than by inspecting the schemas' internals. `dashboards` does not exist yet on this
// branch, so every import above fails to resolve and every test below currently reports "Cannot
// find module" (GOOD red).

describe('AgeBand (openapi.yaml `AgeBand`) — AC-10', () => {
  it('accepts exactly the four Draft Age spans, in the order the Purchasing Pipeline reports them', () => {
    expect(
      [
        'up_to_7_days',
        'from_8_to_14_days',
        'from_15_to_30_days',
        'over_30_days',
      ].every((value) => ageBandSchema.safeParse(value).success),
    ).toBe(true);
  });

  it('rejects a band the glossary does not name', () => {
    expect(ageBandSchema.safeParse('over_60_days').success).toBe(false);
  });
});

describe('UrgencyBand (openapi.yaml `UrgencyBand`) — AC-14', () => {
  it('accepts exactly the three Demand Pressure bands', () => {
    expect(
      ['overdue', 'due_soon', 'later'].every(
        (value) => urgencyBandSchema.safeParse(value).success,
      ),
    ).toBe(true);
  });

  it('rejects a band the glossary does not name', () => {
    expect(urgencyBandSchema.safeParse('soon').success).toBe(false);
  });
});

describe('ArrivalTimingBucketKind (openapi.yaml `ArrivalTimingBucketKind`) — AC-07', () => {
  it('accepts exactly `overdue` and `week`', () => {
    expect(
      ['overdue', 'week'].every(
        (value) => arrivalTimingBucketKindSchema.safeParse(value).success,
      ),
    ).toBe(true);
  });

  it('rejects a kind the axis does not carry', () => {
    expect(arrivalTimingBucketKindSchema.safeParse('month').success).toBe(
      false,
    );
  });
});

describe('ArchivedWarehouseCount (openapi.yaml `ArchivedWarehouseCount`) — spec.md §6 "Exclusion accounting"', () => {
  it('accepts zero and a positive count', () => {
    expect(archivedWarehouseCountSchema.safeParse(0).success).toBe(true);
    expect(archivedWarehouseCountSchema.safeParse(2).success).toBe(true);
  });

  it('rejects a negative count', () => {
    const result = archivedWarehouseCountSchema.safeParse(-1);
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.code).toBe('too_small');
  });

  it('rejects a non-integer count', () => {
    const result = archivedWarehouseCountSchema.safeParse(1.5);
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.code).toBe(
      'invalid_type',
    );
  });
});
