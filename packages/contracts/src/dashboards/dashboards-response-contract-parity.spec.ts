import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  arrivalTimingPanelSchema,
  coverageGapPanelSchema,
  demandPressurePanelSchema,
  orderFlowPanelSchema,
  purchasingPipelinePanelSchema,
  purchasingSpreadPanelSchema,
  reasonConcentrationPanelSchema,
  receiptReliabilityPanelSchema,
} from 'dashboards';
import { describe, expect, it } from 'vitest';

// T3 — the eight Panel response schemas
// (`docs/features/dashboards/contracts/openapi.yaml` components), exercised as behaviour by
// parsing the **exact** `example:` block openapi.yaml carries for each operation, mirroring
// `purchase-drafts/purchase-drafts-contracts.spec.ts`. `dashboards` does not exist yet on this
// branch, so every import above fails to resolve and every test below currently reports "Cannot
// find module" (GOOD red).
//
// This is the regression control the DoD names: a fixture transcribed field-for-field from
// openapi.yaml is the only text either side of the boundary agrees on, so a schema that drops,
// renames, widens or optionalises a field it declares fails a fixture neither side wrote for this
// test. Every negative assertion below names **where** parsing failed — the issue's `path`, `code`
// and (for a rejected key) the key itself — never only `success === false`, which is exactly the
// inert-negative failure mode `purchase-draft-response-contract-parity.spec.ts` found and fixed.

type PlainRecord = Record<string, unknown>;

const removeField = (
  root: PlainRecord,
  path: readonly (string | number)[],
): PlainRecord => {
  const clone = structuredClone(root);
  let cursor = clone as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) {
    cursor = cursor[key] as Record<string | number, unknown>;
  }
  delete cursor[path.at(-1) as string | number];
  return clone;
};

const withBogusKey = (root: PlainRecord): PlainRecord => ({
  ...structuredClone(root),
  zzUndeclaredField: 'drift',
});

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

describe('the module is exposed as a package subpath', () => {
  it('declares ./dashboards in the contract package exports', () => {
    const packageJson = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', '..', 'package.json'),
        'utf8',
      ),
    ) as { exports: Record<string, unknown> };

    expect(packageJson.exports['./dashboards']).toEqual({
      types: './dist/dashboards/index.d.ts',
      default: './dist/dashboards/index.js',
    });
  });
});

// ---- Coverage Gap (openapi.yaml `CoverageGapPanel`) — AC-03 ---------------------------------

const coverageGapExample: PlainRecord = {
  rows: [
    {
      itemId: id(101),
      sku: 'TEST-SKU-0001',
      totalOutstandingQuantity: 880,
      onHandQuantity: 340,
      inboundQuantity: 400,
      uncoveredQuantity: 140,
    },
    {
      itemId: id(102),
      sku: 'TEST-SKU-0002',
      totalOutstandingQuantity: 120,
      onHandQuantity: 120,
      inboundQuantity: 0,
      uncoveredQuantity: 0,
    },
  ],
  remainder: {
    itemCount: 46,
    totalOutstandingQuantity: 2980,
    onHandQuantity: 1840,
    inboundQuantity: 660,
    uncoveredQuantity: 480,
  },
};

describe('CoverageGapPanel (openapi.yaml `CoverageGapPanel`) — AC-03', () => {
  it('parses the openapi.yaml example field for field', () => {
    expect(coverageGapPanelSchema.safeParse(coverageGapExample).success).toBe(
      true,
    );
  });

  it('accepts a null remainder when ten or fewer Items qualify', () => {
    expect(
      coverageGapPanelSchema.safeParse({
        ...coverageGapExample,
        remainder: null,
      }).success,
    ).toBe(true);
  });
});

// ---- Arrival Timing (openapi.yaml `ArrivalTimingPanel`) — AC-07, AC-08a ----------------------

const arrivalTimingExample: PlainRecord = {
  timezone: 'UTC',
  buckets: [
    {
      kind: 'overdue',
      weekStart: null,
      owedQuantity: 1240,
      expectedQuantity: 180,
    },
    {
      kind: 'week',
      weekStart: '2026-09-21',
      owedQuantity: 860,
      expectedQuantity: 1100,
    },
    {
      kind: 'week',
      weekStart: '2026-09-28',
      owedQuantity: 1420,
      expectedQuantity: 640,
    },
    {
      kind: 'week',
      weekStart: '2026-10-05',
      owedQuantity: 500,
      expectedQuantity: 0,
    },
    {
      kind: 'week',
      weekStart: '2026-10-12',
      owedQuantity: 320,
      expectedQuantity: 900,
    },
    {
      kind: 'week',
      weekStart: '2026-10-19',
      owedQuantity: 260,
      expectedQuantity: 0,
    },
    {
      kind: 'week',
      weekStart: '2026-10-26',
      owedQuantity: 140,
      expectedQuantity: 420,
    },
    {
      kind: 'week',
      weekStart: '2026-11-02',
      owedQuantity: 0,
      expectedQuantity: 0,
    },
    {
      kind: 'week',
      weekStart: '2026-11-09',
      owedQuantity: 80,
      expectedQuantity: 0,
    },
  ],
  exclusions: {
    beyondHorizon: { owedQuantity: 3400, customerOrderCount: 17 },
    undatedReadyDrafts: { draftCount: 6, orderedQuantity: 2200 },
    datedDraftsStillInDraft: { draftCount: 4, orderedQuantity: 1500 },
    draftsSinceClosedOrDiscarded: { draftCount: 9 },
  },
};

describe('ArrivalTimingPanel (openapi.yaml `ArrivalTimingPanel`) — AC-07, AC-08a', () => {
  it('parses the openapi.yaml example field for field', () => {
    expect(
      arrivalTimingPanelSchema.safeParse(arrivalTimingExample).success,
    ).toBe(true);
  });

  it.each<[string, readonly (string | number)[]]>([
    [
      'exclusions.beyondHorizon.owedQuantity',
      ['exclusions', 'beyondHorizon', 'owedQuantity'],
    ],
    [
      'exclusions.beyondHorizon.customerOrderCount',
      ['exclusions', 'beyondHorizon', 'customerOrderCount'],
    ],
    [
      'exclusions.undatedReadyDrafts.draftCount',
      ['exclusions', 'undatedReadyDrafts', 'draftCount'],
    ],
    [
      'exclusions.undatedReadyDrafts.orderedQuantity',
      ['exclusions', 'undatedReadyDrafts', 'orderedQuantity'],
    ],
    [
      'exclusions.datedDraftsStillInDraft.draftCount',
      ['exclusions', 'datedDraftsStillInDraft', 'draftCount'],
    ],
    [
      'exclusions.datedDraftsStillInDraft.orderedQuantity',
      ['exclusions', 'datedDraftsStillInDraft', 'orderedQuantity'],
    ],
    [
      'exclusions.draftsSinceClosedOrDiscarded.draftCount',
      ['exclusions', 'draftsSinceClosedOrDiscarded', 'draftCount'],
    ],
  ])(
    '%s is required, never optional (spec.md §6 "Exclusion accounting")',
    (_label, path) => {
      const result = arrivalTimingPanelSchema.safeParse(
        removeField(arrivalTimingExample, path),
      );

      expect(result.success).toBe(false);
      const issue =
        !result.success &&
        result.error.issues.find(
          (candidate) => candidate.path.join('.') === path.join('.'),
        );
      expect(issue).toBeTruthy();
      expect(issue && issue.code).toBe('invalid_type');
    },
  );
});

// ---- Purchasing Pipeline (openapi.yaml `PurchasingPipelinePanel`) — AC-10, AC-11 --------------

const purchasingPipelineExample: PlainRecord = {
  states: [
    {
      state: 'draft',
      bands: [
        { ageBand: 'up_to_7_days', draftCount: 18 },
        { ageBand: 'from_8_to_14_days', draftCount: 9 },
        { ageBand: 'from_15_to_30_days', draftCount: 4 },
        { ageBand: 'over_30_days', draftCount: 2 },
      ],
    },
    {
      state: 'ready_for_ordering',
      bands: [
        { ageBand: 'up_to_7_days', draftCount: 21 },
        { ageBand: 'from_8_to_14_days', draftCount: 11 },
        { ageBand: 'from_15_to_30_days', draftCount: 6 },
        { ageBand: 'over_30_days', draftCount: 0 },
      ],
    },
  ],
};

describe('PurchasingPipelinePanel (openapi.yaml `PurchasingPipelinePanel`) — AC-10, AC-11', () => {
  it('parses the openapi.yaml example field for field', () => {
    expect(
      purchasingPipelinePanelSchema.safeParse(purchasingPipelineExample)
        .success,
    ).toBe(true);
  });

  it('rejects a state Purchasing Pipeline does not present (closed counts toward no week here)', () => {
    const drifted = structuredClone(purchasingPipelineExample) as {
      states: PlainRecord[];
    };
    drifted.states[0].state = 'closed';

    expect(purchasingPipelinePanelSchema.safeParse(drifted).success).toBe(
      false,
    );
  });
});

// ---- Reason Concentration (openapi.yaml `ReasonConcentrationPanel`) — AC-12 -------------------

const reasonConcentrationExample: PlainRecord = {
  totalRefusedQuantity: 2910,
  rows: [
    {
      rejectionReasonId: 'damaged_in_transit',
      label: 'Damaged in transit',
      refusedQuantity: 1620,
      sharePercent: 55.7,
      cumulativeSharePercent: 55.7,
      undecidedQuantity: 540,
      customerReportedQuantity: 210,
    },
    {
      rejectionReasonId: 'wrong_item_supplied',
      label: 'Wrong item supplied',
      refusedQuantity: 980,
      sharePercent: 33.7,
      cumulativeSharePercent: 89.4,
      undecidedQuantity: 120,
      customerReportedQuantity: 0,
    },
  ],
  remainder: {
    reasonCount: 3,
    refusedQuantity: 310,
    undecidedQuantity: 40,
    customerReportedQuantity: 25,
  },
};

describe('ReasonConcentrationPanel (openapi.yaml `ReasonConcentrationPanel`) — AC-12', () => {
  it('parses the openapi.yaml example field for field', () => {
    expect(
      reasonConcentrationPanelSchema.safeParse(reasonConcentrationExample)
        .success,
    ).toBe(true);
  });

  it('presents no Remainder Row while nothing has been gathered into one', () => {
    expect(
      reasonConcentrationPanelSchema.safeParse({
        ...reasonConcentrationExample,
        remainder: null,
      }).success,
    ).toBe(true);
  });
});

// ---- Demand Pressure (openapi.yaml `DemandPressurePanel`) — AC-14 -----------------------------

const demandPressureExample: PlainRecord = {
  archivedWarehouseCount: 2,
  warehouses: [
    {
      warehouseId: id(201),
      warehouseName: 'Test Warehouse North',
      overdueQuantity: 1240,
      dueSoonQuantity: 2180,
      laterQuantity: 3400,
      totalOutstandingQuantity: 6820,
    },
    {
      warehouseId: id(202),
      warehouseName: 'Test Warehouse South',
      overdueQuantity: 160,
      dueSoonQuantity: 420,
      laterQuantity: 980,
      totalOutstandingQuantity: 1560,
    },
  ],
};

describe('DemandPressurePanel (openapi.yaml `DemandPressurePanel`) — AC-14', () => {
  it('parses the openapi.yaml example field for field', () => {
    expect(
      demandPressurePanelSchema.safeParse(demandPressureExample).success,
    ).toBe(true);
  });
});

// ---- Order Flow (openapi.yaml `OrderFlowPanel`) — AC-16, AC-17, AC-17a ------------------------

const orderFlowExample: PlainRecord = {
  timezone: 'UTC',
  archivedWarehouseCount: 2,
  weeks: [
    {
      weekStart: '2026-07-06',
      recordedQuantity: 4200,
      assignedQuantity: 3800,
      cancelledQuantity: 180,
      stillAwaitedQuantity: 220,
    },
    {
      weekStart: '2026-07-13',
      recordedQuantity: 3950,
      assignedQuantity: 3400,
      cancelledQuantity: 220,
      stillAwaitedQuantity: 330,
    },
    {
      weekStart: '2026-07-20',
      recordedQuantity: 4410,
      assignedQuantity: 3900,
      cancelledQuantity: 150,
      stillAwaitedQuantity: 360,
    },
    {
      weekStart: '2026-07-27',
      recordedQuantity: 3720,
      assignedQuantity: 3150,
      cancelledQuantity: 240,
      stillAwaitedQuantity: 330,
    },
    {
      weekStart: '2026-08-03',
      recordedQuantity: 4080,
      assignedQuantity: 3400,
      cancelledQuantity: 200,
      stillAwaitedQuantity: 480,
    },
    {
      weekStart: '2026-08-10',
      recordedQuantity: 4600,
      assignedQuantity: 3720,
      cancelledQuantity: 310,
      stillAwaitedQuantity: 570,
    },
    {
      weekStart: '2026-08-17',
      recordedQuantity: 3890,
      assignedQuantity: 2980,
      cancelledQuantity: 190,
      stillAwaitedQuantity: 720,
    },
    {
      weekStart: '2026-08-24',
      recordedQuantity: 4150,
      assignedQuantity: 2940,
      cancelledQuantity: 260,
      stillAwaitedQuantity: 950,
    },
    {
      weekStart: '2026-08-31',
      recordedQuantity: 4470,
      assignedQuantity: 2610,
      cancelledQuantity: 180,
      stillAwaitedQuantity: 1680,
    },
    {
      weekStart: '2026-09-07',
      recordedQuantity: 3980,
      assignedQuantity: 1840,
      cancelledQuantity: 220,
      stillAwaitedQuantity: 1920,
    },
    {
      weekStart: '2026-09-14',
      recordedQuantity: 4230,
      assignedQuantity: 1120,
      cancelledQuantity: 140,
      stillAwaitedQuantity: 2970,
    },
    {
      weekStart: '2026-09-21',
      recordedQuantity: 1820,
      assignedQuantity: 240,
      cancelledQuantity: 0,
      stillAwaitedQuantity: 1580,
    },
  ],
};

describe('OrderFlowPanel (openapi.yaml `OrderFlowPanel`) — AC-16, AC-17, AC-17a', () => {
  it('parses the openapi.yaml example field for field, exactly twelve weeks', () => {
    const parsed = orderFlowPanelSchema.safeParse(orderFlowExample);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.weeks).toHaveLength(12);
  });

  it('rejects eleven weeks — the axis is fixed, not a client-truncated tail', () => {
    expect(
      orderFlowPanelSchema.safeParse({
        ...orderFlowExample,
        weeks: (orderFlowExample.weeks as unknown[]).slice(0, 11),
      }).success,
    ).toBe(false);
  });
});

// ---- Purchasing Spread (openapi.yaml `PurchasingSpreadPanel`) — AC-18 -------------------------

const purchasingSpreadExample: PlainRecord = {
  archivedWarehouseCount: 2,
  warehouses: [
    {
      warehouseId: id(201),
      warehouseName: 'Test Warehouse North',
      counts: [
        { state: 'draft', draftCount: 33 },
        { state: 'ready_for_ordering', draftCount: 38 },
        { state: 'closed', draftCount: 124 },
        { state: 'discarded', draftCount: 11 },
      ],
    },
    {
      warehouseId: id(202),
      warehouseName: 'Test Warehouse South',
      counts: [
        { state: 'draft', draftCount: 4 },
        { state: 'ready_for_ordering', draftCount: 7 },
        { state: 'closed', draftCount: 19 },
        { state: 'discarded', draftCount: 0 },
      ],
    },
  ],
};

describe('PurchasingSpreadPanel (openapi.yaml `PurchasingSpreadPanel`) — AC-18', () => {
  it('parses the openapi.yaml example field for field, `closed` and `discarded` included', () => {
    expect(
      purchasingSpreadPanelSchema.safeParse(purchasingSpreadExample).success,
    ).toBe(true);
  });
});

// ---- Receipt Reliability (openapi.yaml `ReceiptReliabilityPanel`) — AC-19, AC-20, AC-20a -------

const receiptReliabilityExample: PlainRecord = {
  archivedWarehouseCount: 2,
  warehouses: [
    {
      warehouseId: id(201),
      warehouseName: 'Test Warehouse North',
      onTimeArrivalRatePercent: 82.4,
      conformanceRatePercent: 91.0,
      receivedQuantity: 18400,
      exclusions: {
        undatedLineCount: 34,
        noEndingRecordedLineCount: 52,
        nothingReceivedLineCount: 7,
        directToCustomerLineCount: 61,
        unrecordedConformanceLineCount: 88,
        notApplicableConformanceLineCount: 19,
      },
    },
    {
      warehouseId: id(203),
      warehouseName: 'Test Warehouse East',
      onTimeArrivalRatePercent: null,
      conformanceRatePercent: null,
      receivedQuantity: 0,
      exclusions: {
        undatedLineCount: 12,
        noEndingRecordedLineCount: 5,
        nothingReceivedLineCount: 0,
        directToCustomerLineCount: 9,
        unrecordedConformanceLineCount: 26,
        notApplicableConformanceLineCount: 0,
      },
    },
  ],
};

describe('ReceiptReliabilityPanel (openapi.yaml `ReceiptReliabilityPanel`) — AC-19, AC-20, AC-20a', () => {
  it('parses the openapi.yaml example field for field, the no-rate Warehouse included', () => {
    expect(
      receiptReliabilityPanelSchema.safeParse(receiptReliabilityExample)
        .success,
    ).toBe(true);
  });

  it.each<[string, readonly (string | number)[]]>([
    [
      'warehouses[0].exclusions.undatedLineCount',
      ['warehouses', 0, 'exclusions', 'undatedLineCount'],
    ],
    [
      'warehouses[0].exclusions.noEndingRecordedLineCount',
      ['warehouses', 0, 'exclusions', 'noEndingRecordedLineCount'],
    ],
    [
      'warehouses[0].exclusions.nothingReceivedLineCount',
      ['warehouses', 0, 'exclusions', 'nothingReceivedLineCount'],
    ],
    [
      'warehouses[0].exclusions.directToCustomerLineCount',
      ['warehouses', 0, 'exclusions', 'directToCustomerLineCount'],
    ],
    [
      'warehouses[0].exclusions.unrecordedConformanceLineCount',
      ['warehouses', 0, 'exclusions', 'unrecordedConformanceLineCount'],
    ],
    [
      'warehouses[0].exclusions.notApplicableConformanceLineCount',
      ['warehouses', 0, 'exclusions', 'notApplicableConformanceLineCount'],
    ],
  ])('%s is required, never optional (AC-20)', (_label, path) => {
    const result = receiptReliabilityPanelSchema.safeParse(
      removeField(receiptReliabilityExample, path),
    );

    expect(result.success).toBe(false);
    const issue =
      !result.success &&
      result.error.issues.find(
        (candidate) => candidate.path.join('.') === path.join('.'),
      );
    expect(issue).toBeTruthy();
    expect(issue && issue.code).toBe('invalid_type');
  });
});

// ---- ArchivedWarehouseCount is required on every Workspace Panel it names (spec.md §8 default) --

describe('archivedWarehouseCount is required, never optional, on every Workspace Panel', () => {
  it.each<[string, { safeParse: (value: unknown) => unknown }, PlainRecord]>([
    ['DemandPressurePanel', demandPressurePanelSchema, demandPressureExample],
    ['OrderFlowPanel', orderFlowPanelSchema, orderFlowExample],
    [
      'PurchasingSpreadPanel',
      purchasingSpreadPanelSchema,
      purchasingSpreadExample,
    ],
    [
      'ReceiptReliabilityPanel',
      receiptReliabilityPanelSchema,
      receiptReliabilityExample,
    ],
  ])('%s.archivedWarehouseCount is required', (_label, schema, example) => {
    const result = schema.safeParse(
      removeField(example, ['archivedWarehouseCount']),
    ) as {
      success: boolean;
      error?: { issues: { path: (string | number)[]; code: string }[] };
    };

    expect(result.success).toBe(false);
    const issue = result.error?.issues.find(
      (candidate) => candidate.path.join('.') === 'archivedWarehouseCount',
    );
    expect(issue).toBeTruthy();
    expect(issue?.code).toBe('invalid_type');
  });
});

// ---- Strictness: openapi.yaml declares `additionalProperties: false` on every one of these ------

describe('every Panel schema rejects a property openapi.yaml does not declare', () => {
  it.each<[string, { safeParse: (value: unknown) => unknown }, PlainRecord]>([
    ['CoverageGapPanel', coverageGapPanelSchema, coverageGapExample],
    ['ArrivalTimingPanel', arrivalTimingPanelSchema, arrivalTimingExample],
    [
      'PurchasingPipelinePanel',
      purchasingPipelinePanelSchema,
      purchasingPipelineExample,
    ],
    [
      'ReasonConcentrationPanel',
      reasonConcentrationPanelSchema,
      reasonConcentrationExample,
    ],
    ['DemandPressurePanel', demandPressurePanelSchema, demandPressureExample],
    ['OrderFlowPanel', orderFlowPanelSchema, orderFlowExample],
    [
      'PurchasingSpreadPanel',
      purchasingSpreadPanelSchema,
      purchasingSpreadExample,
    ],
    [
      'ReceiptReliabilityPanel',
      receiptReliabilityPanelSchema,
      receiptReliabilityExample,
    ],
  ])('%s', (_label, schema, example) => {
    const result = schema.safeParse(withBogusKey(example)) as {
      success: boolean;
      error?: { issues: { code: string; keys?: string[] }[] };
    };

    expect(result.success).toBe(false);
    const issue = result.error?.issues.find(
      (candidate) => candidate.code === 'unrecognized_keys',
    );
    expect(issue).toBeTruthy();
    expect(issue?.keys).toContain('zzUndeclaredField');
  });
});
