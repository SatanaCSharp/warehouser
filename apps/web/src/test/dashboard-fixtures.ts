import type {
  ArrivalTimingBucket,
  ArrivalTimingPanel,
  CoverageGapPanel,
  DemandPressurePanel,
  OrderFlowPanel,
  OrderFlowWeek,
  PurchasingPipelinePanel,
  PurchasingSpreadCell,
  PurchasingSpreadPanel,
  ReasonConcentrationPanel,
  ReceiptReliabilityPanel,
} from '@warehouser/contracts/dashboards';
import {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { accessIds } from 'test/access-fixtures';
import { vi } from 'vitest';

// T16 — cross-cutting support for the Warehouse Dashboard specs: the loader's,
// the grid's and the page's. Consumed by more than one spec, so it sits at the
// root of `src/test/` beside `access-fixtures.ts` rather than inside any one of
// them (`placing-web-tests.md` §4).

/**
 * The four Panel addresses `contracts/openapi.yaml` publishes and
 * `WarehouseDashboardController` serves, written out in full. Specs route their
 * stub and assert against these rather than matching a suffix, for the reason
 * `access-fixtures.ts` gives: a suffix match keeps passing after the server
 * moves a handler.
 */
export const dashboardPath = (warehouseId: string, panel: string): string =>
  `/api/v1/warehouses/${warehouseId}/dashboard/${panel}`;

export const COVERAGE_GAP_URL = dashboardPath(
  accessIds.warehouse,
  'coverage-gap',
);
export const ARRIVAL_TIMING_URL = dashboardPath(
  accessIds.warehouse,
  'arrival-timing',
);
export const PURCHASING_PIPELINE_URL = dashboardPath(
  accessIds.warehouse,
  'purchasing-pipeline',
);
export const REASON_CONCENTRATION_URL = dashboardPath(
  accessIds.warehouse,
  'reason-concentration',
);

export const CURRENT_ACCESS_URL = `/api/v1/warehouses/${accessIds.warehouse}/access/current`;

/**
 * `spec.md` §6.1 — a Panel is present only when the actor holds **every**
 * Permission its figures are drawn from. Stated once here so no spec re-derives
 * the conjunction it is varying.
 */
export const panelPermissions = {
  coverageGap: [
    PermissionId.CUSTOMER_ORDERS_WATCH,
    PermissionId.ITEMS_WATCH,
    PermissionId.PURCHASE_DRAFTS_WATCH,
  ],
  arrivalTiming: [
    PermissionId.CUSTOMER_ORDERS_WATCH,
    PermissionId.PURCHASE_DRAFTS_WATCH,
  ],
  purchasingPipeline: [PermissionId.PURCHASE_DRAFTS_WATCH],
  reasonConcentration: [PermissionId.REJECTIONS_WATCH],
} as const;

/** Every watch Permission the Warehouse surface reads from (AC-01). */
export const allWatchPermissions: readonly PermissionId[] = [
  PermissionId.CUSTOMER_ORDERS_WATCH,
  PermissionId.ITEMS_WATCH,
  PermissionId.PURCHASE_DRAFTS_WATCH,
  PermissionId.REJECTIONS_WATCH,
];

/**
 * One marker per Panel, each of which the approved design requires that Panel to
 * print: the Item name on every Coverage Gap row, the Reason wording on every
 * Reason Concentration row, every Purchasing Pipeline segment's own count, and
 * the Arrival Timing footnote's exclusion counts
 * (`design-handoff.md` § Panel specifications).
 *
 * They are what makes the fixed Panel **order** assertable without reading a
 * single translated string: the four markers appear in the document in the order
 * their Panels do. The two numeric ones stay under a thousand so no thousands
 * separator can come between their digits (`design-handoff.md` § Type and mark
 * specs: space-grouped thousands), and no other seeded figure repeats them.
 */
export const panelMarkers = {
  coverageGap: 'SKU-COVERAGE-MARKER',
  reasonConcentration: 'Reason concentration marker',
  arrivalTiming: '461',
  purchasingPipeline: '917',
} as const;

export const coverageGapPanel: CoverageGapPanel = {
  rows: [
    {
      itemId: '00000000-0000-4000-8000-000000000301',
      sku: panelMarkers.coverageGap,
      totalOutstandingQuantity: 291,
      onHandQuantity: 3,
      inboundQuantity: 4,
      // Distinctive on purpose: AC-26's spec proves this figure is *gone* after
      // a second entry, so no other seeded number may contain it.
      uncoveredQuantity: 284,
    },
  ],
  remainder: null,
};

const emptyWeek = (weekStart: string): ArrivalTimingBucket => ({
  kind: 'week',
  weekStart,
  owedQuantity: 0,
  expectedQuantity: 0,
});

export const arrivalTimingPanel: ArrivalTimingPanel = {
  timezone: 'UTC',
  buckets: [
    {
      kind: 'overdue',
      weekStart: null,
      owedQuantity: 0,
      expectedQuantity: 0,
    },
    emptyWeek('2026-09-21'),
    emptyWeek('2026-09-28'),
    emptyWeek('2026-10-05'),
    emptyWeek('2026-10-12'),
    emptyWeek('2026-10-19'),
    emptyWeek('2026-10-26'),
    emptyWeek('2026-11-02'),
    emptyWeek('2026-11-09'),
  ],
  exclusions: {
    beyondHorizon: {
      owedQuantity: 0,
      // The marker: AC-07 requires this count to be stated in the footnote.
      customerOrderCount: Number(panelMarkers.arrivalTiming),
    },
    undatedReadyDrafts: { draftCount: 0, orderedQuantity: 0 },
    datedDraftsStillInDraft: { draftCount: 0, orderedQuantity: 0 },
    draftsSinceClosedOrDiscarded: { draftCount: 0 },
  },
};

export const purchasingPipelinePanel: PurchasingPipelinePanel = {
  states: [
    {
      state: 'draft',
      bands: [
        // The marker: every segment prints its own count (AC-10).
        {
          ageBand: 'up_to_7_days',
          draftCount: Number(panelMarkers.purchasingPipeline),
        },
        { ageBand: 'from_8_to_14_days', draftCount: 0 },
        { ageBand: 'from_15_to_30_days', draftCount: 0 },
        { ageBand: 'over_30_days', draftCount: 0 },
      ],
    },
    {
      state: 'ready_for_ordering',
      bands: [
        { ageBand: 'up_to_7_days', draftCount: 0 },
        { ageBand: 'from_8_to_14_days', draftCount: 0 },
        { ageBand: 'from_15_to_30_days', draftCount: 0 },
        { ageBand: 'over_30_days', draftCount: 0 },
      ],
    },
  ],
};

export const reasonConcentrationPanel: ReasonConcentrationPanel = {
  totalRefusedQuantity: 20,
  rows: [
    {
      rejectionReasonId: 'damaged_in_transit',
      label: panelMarkers.reasonConcentration,
      refusedQuantity: 20,
      sharePercent: 100,
      cumulativeSharePercent: 100,
      undecidedQuantity: 6,
      customerReportedQuantity: 8,
    },
  ],
  remainder: null,
};

/**
 * A second Coverage Gap body, identical in shape and different in figure, for
 * AC-26: entering again must show what the Warehouse holds **now**, so a spec
 * needs a superseded figure to prove was not carried over.
 */
export const amendedCoverageGapPanel: CoverageGapPanel = {
  rows: [
    {
      itemId: '00000000-0000-4000-8000-000000000301',
      sku: panelMarkers.coverageGap,
      totalOutstandingQuantity: 340,
      onHandQuantity: 3,
      inboundQuantity: 4,
      uncoveredQuantity: 333,
    },
  ],
  remainder: null,
};

type DashboardServerOptions = {
  archivedAt?: string | null;
  /** What `coverage-gap` answers with, so a spec can change it between entries. */
  coverageGap?: CoverageGapPanel;
  permissionIds?: readonly PermissionId[];
  /**
   * Panel URLs the stub answers with a 500 instead of a body, so a spec can
   * exercise the arm a Panel renders when the member is admitted to it and its
   * own read failed.
   */
  failing?: readonly string[];
};

/**
 * Answers the projection and the four Panel reads from the fixtures above, and
 * returns the URLs requested — which is how a spec proves a Panel the actor may
 * not read is never fetched, and how the AC-02 case proves that **nothing at
 * all** was issued.
 *
 * Every route is matched by its exact per-Warehouse URL, so a request that
 * forgets its Warehouse 404s here just as it would against the server.
 */
export const stubDashboardServer = ({
  archivedAt = null,
  coverageGap = coverageGapPanel,
  failing = [],
  permissionIds = allWatchPermissions,
}: DashboardServerOptions = {}): string[] => {
  const requestedUrls: string[] = [];
  const routes: [string, unknown][] = [
    [
      CURRENT_ACCESS_URL,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds,
        archivedAt,
      },
    ],
    [COVERAGE_GAP_URL, coverageGap],
    [ARRIVAL_TIMING_URL, arrivalTimingPanel],
    [PURCHASING_PIPELINE_URL, purchasingPipelinePanel],
    [REASON_CONCENTRATION_URL, reasonConcentrationPanel],
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      requestedUrls.push(url);
      if (failing.includes(url)) {
        return Promise.resolve(Response.json({}, { status: 500 }));
      }

      const route = routes.find(([path]) => url === path);
      return Promise.resolve(
        route ? Response.json(route[1]) : Response.json({}, { status: 404 }),
      );
    }),
  );

  return requestedUrls;
};

// ---------------------------------------------------------------------------
// The Workspace surface (T19)
// ---------------------------------------------------------------------------

// T19 — the same cross-cutting role for the Workspace Dashboard's specs that
// the Warehouse fixtures above play for its sibling: the loader's, the page's
// and the route's. Kept in this one file rather than a second root fixture so
// "the Dashboards' in-memory backend" stays one thing
// (`placing-web-tests.md` §4).

/**
 * The four Workspace Panel addresses `contracts/openapi.yaml` publishes and
 * `WorkspaceDashboardController` serves, written out in full for the reason
 * the Warehouse block above gives.
 *
 * **No address names a Workspace**, in a path, a query or a body position:
 * `WorkspaceAccessGuard` derives the actor's Workspace entirely from the
 * session, so there is no identifier for a request to offer (AC-22).
 */
export const workspaceDashboardPath = (panel: string): string =>
  `/api/v1/workspace/dashboard/${panel}`;

export const DEMAND_PRESSURE_URL = workspaceDashboardPath('demand-pressure');
export const ORDER_FLOW_URL = workspaceDashboardPath('order-flow');
export const PURCHASING_SPREAD_URL =
  workspaceDashboardPath('purchasing-spread');
export const RECEIPT_RELIABILITY_URL = workspaceDashboardPath(
  'receipt-reliability',
);

/** The projection the Workspace Permission that admits this surface is read from. */
export const WORKSPACE_CONTEXT_URL = '/api/v1/workspace/context';

/**
 * One marker per Warehouse-listing Panel: a Warehouse name each of the three
 * is required to print — one bar per Warehouse on Demand Pressure, one row per
 * Warehouse on Purchasing Spread, and every Receipt Reliability mark
 * direct-labelled with its Warehouse name (`design-handoff.md` § Panel
 * specifications, § Accessibility).
 *
 * The three names differ **per Panel**, which the Workspace's real population
 * would not: these are three independent stub responses, and a name that
 * appeared in two of them could not tell the reader which Panel drew it. The
 * distinctness is what makes the fixed Panel order assertable without matching
 * a single translated string, exactly as `panelMarkers` above does for the
 * Warehouse surface. Order Flow carries no marker because it **names no
 * Warehouse at all** (AC-16) and its column plot prints bucket labels rather
 * than values — its position is asserted by the exclusion of the other three.
 */
export const workspacePanelMarkers = {
  demandPressure: 'Demand Pressure Depot',
  purchasingSpread: 'Purchasing Spread Depot',
  receiptReliability: 'Receipt Reliability Depot',
} as const;

export const demandPressurePanel: DemandPressurePanel = {
  archivedWarehouseCount: 0,
  warehouses: [
    {
      warehouseId: '00000000-0000-4000-8000-000000000401',
      warehouseName: workspacePanelMarkers.demandPressure,
      overdueQuantity: 120,
      dueSoonQuantity: 80,
      laterQuantity: 40,
      // Distinctive on purpose: AC-26's spec proves this figure is *gone*
      // after a second entry, so no other seeded number may contain it.
      totalOutstandingQuantity: 240,
    },
  ],
};

const orderFlowWeek = (weekStart: string): OrderFlowWeek => ({
  weekStart,
  recordedQuantity: 0,
  assignedQuantity: 0,
  cancelledQuantity: 0,
  stillAwaitedQuantity: 0,
});

/** Exactly twelve weeks, oldest first — the contract admits no other length. */
export const orderFlowPanel: OrderFlowPanel = {
  timezone: 'UTC',
  archivedWarehouseCount: 0,
  weeks: [
    '2026-07-06',
    '2026-07-13',
    '2026-07-20',
    '2026-07-27',
    '2026-08-03',
    '2026-08-10',
    '2026-08-17',
    '2026-08-24',
    '2026-08-31',
    '2026-09-07',
    '2026-09-14',
    '2026-09-21',
  ].map(orderFlowWeek),
};

const spreadCounts = (draftCount: number): PurchasingSpreadCell[] => [
  { state: 'draft', draftCount },
  { state: 'ready_for_ordering', draftCount: 0 },
  { state: 'closed', draftCount: 0 },
  { state: 'discarded', draftCount: 0 },
];

export const purchasingSpreadPanel: PurchasingSpreadPanel = {
  archivedWarehouseCount: 0,
  warehouses: [
    {
      warehouseId: '00000000-0000-4000-8000-000000000402',
      warehouseName: workspacePanelMarkers.purchasingSpread,
      counts: spreadCounts(3),
    },
  ],
};

export const receiptReliabilityPanel: ReceiptReliabilityPanel = {
  archivedWarehouseCount: 0,
  warehouses: [
    {
      warehouseId: '00000000-0000-4000-8000-000000000403',
      warehouseName: workspacePanelMarkers.receiptReliability,
      onTimeArrivalRatePercent: 75,
      conformanceRatePercent: 50,
      receivedQuantity: 12,
      exclusions: {
        undatedLineCount: 0,
        noEndingRecordedLineCount: 0,
        nothingReceivedLineCount: 0,
        directToCustomerLineCount: 0,
        unrecordedConformanceLineCount: 0,
        notApplicableConformanceLineCount: 0,
      },
    },
  ],
};

/**
 * A second Demand Pressure body, identical in shape and different in figure,
 * for AC-26: entering again must show what the Workspace's Warehouses hold
 * **now**, so a spec needs a superseded figure to prove was not carried over.
 */
export const amendedDemandPressurePanel: DemandPressurePanel = {
  archivedWarehouseCount: 0,
  warehouses: [
    {
      ...demandPressurePanel.warehouses[0],
      overdueQuantity: 351,
      totalOutstandingQuantity: 471,
    },
  ],
};

type WorkspaceDashboardServerOptions = {
  /** What `demand-pressure` answers with, so a spec can change it between entries. */
  demandPressure?: DemandPressurePanel;
  /**
   * The **Warehouse-level** watch Permissions the actor holds in the Warehouse
   * the context names. AC-22's second actor holds every one of them and no
   * Workspace Role at all, which must still deny: authority in one Warehouse
   * says nothing about the Workspace above it.
   */
  permissionIds?: readonly PermissionId[];
  /**
   * Panel URLs the stub answers with a 500, so a spec can exercise the arm a
   * Panel renders when the member is admitted to it and its own read failed.
   */
  failing?: readonly string[];
  workspacePermissionIds?: readonly WorkspacePermissionId[];
};

/**
 * Answers the Workspace context, the four Workspace Panel reads and the
 * Warehouse-level access projection from the fixtures above, and returns the
 * URLs requested — which is how a spec proves a refused actor costs **zero**
 * Panel requests, and how the surface proves it issues nothing after it paints.
 *
 * Every route is matched by its exact URL, so a read that invents an address
 * 404s here just as it would against the server.
 */
export const stubWorkspaceDashboardServer = ({
  demandPressure = demandPressurePanel,
  failing = [],
  permissionIds = allWatchPermissions,
  workspacePermissionIds = [WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH],
}: WorkspaceDashboardServerOptions = {}): string[] => {
  const requestedUrls: string[] = [];
  const routes: [string, unknown][] = [
    [
      WORKSPACE_CONTEXT_URL,
      {
        workspace: { id: accessIds.workspace, name: 'Acme Logistics' },
        workspacePermissionIds,
        warehouses: [
          {
            warehouseId: accessIds.warehouse,
            name: 'Main Warehouse',
            archivedAt: null,
            roleId: accessIds.managerRole,
            roleKind: 'warehouse_manager',
          },
        ],
        effectiveWarehouseId: accessIds.warehouse,
      },
    ],
    [
      CURRENT_ACCESS_URL,
      {
        warehouseId: accessIds.warehouse,
        roleId: accessIds.managerRole,
        roleKind: 'warehouse_manager',
        permissionIds,
        archivedAt: null,
      },
    ],
    [DEMAND_PRESSURE_URL, demandPressure],
    [ORDER_FLOW_URL, orderFlowPanel],
    [PURCHASING_SPREAD_URL, purchasingSpreadPanel],
    [RECEIPT_RELIABILITY_URL, receiptReliabilityPanel],
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request | string | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      requestedUrls.push(url);
      if (failing.includes(url)) {
        return Promise.resolve(Response.json({}, { status: 500 }));
      }

      const route = routes.find(([path]) => url === path);
      return Promise.resolve(
        route ? Response.json(route[1]) : Response.json({}, { status: 404 }),
      );
    }),
  );

  return requestedUrls;
};
