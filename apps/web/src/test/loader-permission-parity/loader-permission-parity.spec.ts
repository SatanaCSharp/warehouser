import { globSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { describe, expect, it } from 'vitest';

import {
  membersReadPermissions,
  rolesReadPermissions,
  rolesTabPermissions,
} from 'modules/access/utils/access-permission-sets';
import { hasPermission } from 'shared/hooks/queries/usePermissions';

/**
 * The loader/surface Permission parity gate for the global-loader change
 * request (CR-RG-02, `sad.md` §4.5).
 *
 * **Why it is here and not beside a subject.** The behaviour it pins is a fact
 * about four owners at once — two route loaders, eight query hooks and two tab
 * bars — and none of them owns it: the loaders declare what a route prefetches,
 * the hooks and the tab descriptors declare what the mounted surface fetches,
 * and CR-RG-02's claim is that the two enumerations are *the same*. A spec
 * placed in any one of those directories would read as if that directory owned
 * the agreement, so `docs/system/guides/placing-web-tests.md` §3 files it in its
 * own dedicated directory under `src/test/` instead.
 *
 * **Why it is a merge blocker.** `change.md` §6's abort threshold names
 * CR-RG-02: drift between a loader and the surface it reproduces is *silent*
 * (`sad.md` §11) — a widened loader leaks a dataset the actor may not read, a
 * narrowed one takes away a dataset they hold today, and neither shows up as a
 * failing render. `sad.md` §4.5 removes most of that risk structurally by giving
 * the three access sets one declaration that both sides import; this file is the
 * standing check over all ten rows, and the only protection at all for the row
 * that has no constant to share (`listWorkspaceWarehouses`).
 *
 * **What it reads, and why source rather than behaviour.** The colocated loader
 * specs already run the loaders and count requests per actor
 * (`workspace-administration.loader.spec.ts`, `access-surface.loader.spec.ts`);
 * `test-plan.md` §"Where the rows land" gives this file CR-RG-02's *structural*
 * drift check instead. So it extracts each loader's declared dispatch gate and
 * each surface's declared gate from the sources themselves, resolves both to the
 * Permission identifiers they actually name, and compares them. A behavioural
 * spec fails when an actor is served the wrong thing; this one fails when the
 * two declarations stop saying the same thing, which is one commit earlier.
 *
 * **Both directions are regressions, and both are checked.** A loader that
 * dispatches a dataset no admitted surface fetches fails
 * (`dispatches exactly the datasets…`), and an admitted surface that fetches a
 * dataset its loader does not prefetch fails (`enumerates every consumer…`).
 *
 * **The asymmetry this file exists to get right.** Three gate kinds appear in
 * CR-RG-02's table and conflating them is the mistake it names.
 * `listWorkspaceWarehouses` has **no hook skip at all** — `WarehousesTab` reads
 * it ungated because reaching the tab is the gate — so its parity is measured
 * against the Warehouses **tab descriptor**'s `WAREHOUSES:WATCH`, and the
 * absence of a hook skip is asserted rather than reported as a violation.
 *
 * `sad.md` §11 leaves the workspace-side tab-descriptor extraction open. If it
 * lands, the `workspaceRoute` half of this file retires and CR-RG-02's
 * structural row shrinks to the access sets.
 */

const SRC_DIRECTORY = posix.dirname(
  posix.dirname(posix.dirname(fileURLToPath(import.meta.url))),
);

const sourceOf = (relativePath: string): string =>
  readFileSync(posix.join(SRC_DIRECTORY, relativePath), 'utf8');

// ---------------------------------------------------------------------------
// Resolving a gate expression to the Permission identifiers it names
// ---------------------------------------------------------------------------

/**
 * Both Permission vocabularies, keyed by member name alone. Reading the member
 * rather than the qualifier is deliberate: the loaders import the enum under an
 * alias (`WorkspacePermissionId as WorkspacePermissionIdValue`) while the tab
 * descriptors import it unaliased, so comparing qualified expressions textually
 * would report a drift that does not exist. The member names are unique across
 * the two vocabularies, which the first case below asserts rather than assumes —
 * if that ever stops holding, this resolution silently answers for the wrong
 * level and the gate is worthless.
 */
const PERMISSION_LEVELS: Record<string, Record<string, string>> = {
  PermissionId,
  WorkspacePermissionId,
};

type ResolvedGate = {
  level: string;
  permissionIds: readonly string[];
};

const permissionByMember = (): Map<string, ResolvedGate> =>
  new Map(
    Object.entries(PERMISSION_LEVELS).flatMap(([level, members]) =>
      Object.entries(members).map(([member, value]): [string, ResolvedGate] => [
        member,
        { level, permissionIds: [value] },
      ]),
    ),
  );

/** The `sad.md` §4.5 sets, resolved by the name the sources name them by. */
const NAMED_SETS: Record<string, readonly string[]> = {
  membersReadPermissions,
  rolesReadPermissions,
  rolesTabPermissions,
};

const MEMBER_REFERENCE = /^[A-Za-z0-9_$]+\.(?<member>[A-Z0-9_]+)$/u;

/**
 * Resolves one gate expression — `WorkspacePermissionIdValue.WAREHOUSES_WATCH`,
 * `rolesTabPermissions`, `[PermissionId.USERS_WATCH]` — to the Permission
 * identifier values it admits. An expression this cannot resolve is returned as
 * an unresolved marker rather than silently as an empty set, because an empty
 * set compares equal to another empty set and would turn a broken extraction
 * into a green run.
 */
const resolveGate = (expression: string): ResolvedGate => {
  const trimmed = expression.trim().replace(/,$/u, '').trim();

  if (trimmed.startsWith('[')) {
    const members = trimmed
      .slice(1, -1)
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map(resolveGate);

    return {
      level: members[0]?.level ?? `unresolved(${trimmed})`,
      permissionIds: members.flatMap(({ permissionIds }) => permissionIds),
    };
  }

  const namedSet = NAMED_SETS[trimmed];
  if (namedSet) {
    return { level: 'PermissionId', permissionIds: namedSet };
  }

  const member = MEMBER_REFERENCE.exec(trimmed)?.groups?.member;
  const resolved =
    member === undefined ? undefined : permissionByMember().get(member);

  return resolved ?? { level: `unresolved(${trimmed})`, permissionIds: [] };
};

const gateFingerprint = (gate: ResolvedGate): string =>
  `${gate.level}: ${[...gate.permissionIds].sort().join(', ')}`;

// ---------------------------------------------------------------------------
// What a loader declares
// ---------------------------------------------------------------------------

const WORKSPACE_LOADER =
  'modules/workspace/loaders/workspace-administration.loader.ts';
const WORKSPACE_ACCESS_DATASETS_LOADER =
  'modules/access/loaders/workspace-administration-datasets.loader.ts';
const ACCESS_LOADER = 'modules/access/loaders/access-surface.loader.ts';

/**
 * `workspaceRoute`'s await window is two files, because `modules/access`
 * contributes its three datasets through a declared surface rather than letting
 * `modules/workspace` name them (`sad.md` §5.4). CR-RG-02 attributes all five
 * secondary rows to the one loader, so both files are read as one.
 */
const LOADER_FILES: Record<string, readonly string[]> = {
  accessRoute: [ACCESS_LOADER],
  workspaceRoute: [WORKSPACE_LOADER, WORKSPACE_ACCESS_DATASETS_LOADER],
};

/** The `gatedDatasets` array literal — every conditional dispatch lives here. */
const GATED_REGION = /gatedDatasets\s*=[\s\S]*?\n\];/u;
const ENDPOINT_DISPATCH =
  /endpoints\.(?<endpoint>[A-Za-z0-9_]+)\.initiate\(\s*(?<argument>[A-Za-z0-9_]+)/u;
const EVERY_ENDPOINT_DISPATCH = new RegExp(ENDPOINT_DISPATCH, 'gu');
const GATE_FIELD = /\bpermissions?:\s*(?<gate>\[[^\]]*\]|[^,\n]+)/u;

type LoaderDispatch = {
  argument: string;
  endpoint: string;
  file: string;
  /** `null` where the loader dispatches outside its gated array. */
  gateExpression: string | null;
};

/**
 * Every dispatch one loader file declares, each with the gate expression that
 * decides it. The gated array is split on its `dispatch:` keys, so a chunk holds
 * exactly one entry's endpoint and exactly one entry's `permission(s):` field;
 * an entry whose gate field is deleted therefore reads as **ungated**, which is
 * the violation it is, rather than borrowing its neighbour's.
 */
const dispatchesIn = (file: string): LoaderDispatch[] => {
  const source = sourceOf(file);
  const region = GATED_REGION.exec(source)?.[0] ?? '';
  const gated = region
    .split(/\bdispatch:\s*/u)
    .slice(1)
    .flatMap((chunk): LoaderDispatch[] => {
      const dispatch = ENDPOINT_DISPATCH.exec(chunk)?.groups;
      if (!dispatch) {
        return [];
      }

      return [
        {
          argument: dispatch.argument ?? '',
          endpoint: dispatch.endpoint ?? '',
          file,
          gateExpression: GATE_FIELD.exec(chunk)?.groups?.gate ?? null,
        },
      ];
    });

  const ungated = Array.from(
    source.split(region).join('\n').matchAll(EVERY_ENDPOINT_DISPATCH),
    ({ groups }): LoaderDispatch => ({
      argument: groups?.argument ?? '',
      endpoint: groups?.endpoint ?? '',
      file,
      gateExpression: null,
    }),
  );

  return [...gated, ...ungated];
};

const dispatchesOf = (loader: string): LoaderDispatch[] =>
  (LOADER_FILES[loader] ?? []).flatMap(dispatchesIn);

const dispatchOf = (loader: string, endpoint: string): LoaderDispatch[] =>
  dispatchesOf(loader).filter((dispatch) => dispatch.endpoint === endpoint);

// ---------------------------------------------------------------------------
// What a surface declares
// ---------------------------------------------------------------------------

/**
 * The two shapes a Permission is read in when the answer feeds a query `skip`
 * (`docs/system/adr/19-08-2026-declarative-permission-gates.md` §3), with the
 * argument position the gate occupies in each. Reading the position rather than
 * "the last argument" keeps `useHasPermission(set, 'all')` from being mistaken
 * for a gate on `'all'` if a call site ever passes a match mode.
 */
const GATE_ARGUMENT_INDEX: Record<string, number> = {
  hasPermission: 1,
  hasWorkspacePermission: 1,
  useHasPermission: 0,
  useHasWorkspacePermission: 0,
};

const PERMISSION_READ =
  /\b(?<callee>useHasPermission|useHasWorkspacePermission|hasPermission|hasWorkspacePermission)\(\s*(?<args>[^)]*)\)/gu;

/** Every gate expression a file reads to decide a `skip`, in source order. */
const gateExpressionsIn = (file: string): string[] =>
  Array.from(sourceOf(file).matchAll(PERMISSION_READ), ({ groups }) => {
    const index = GATE_ARGUMENT_INDEX[groups?.callee ?? ''] ?? 0;

    return (groups?.args ?? '').split(',')[index]?.trim() ?? '';
  }).filter((expression) => expression.length > 0);

const DESCRIPTOR = /\{\s*id:\s*'(?<id>[^']+)',(?<body>[^{}]*)\}/gu;

/** The `permission` field of one tab descriptor, found by the tab's own id. */
const descriptorGateIn = (file: string, descriptorId: string): string[] =>
  Array.from(sourceOf(file).matchAll(DESCRIPTOR))
    .filter(({ groups }) => groups?.id === descriptorId)
    .flatMap(({ groups }) => {
      const gate = GATE_FIELD.exec(groups?.body ?? '')?.groups?.gate;

      return gate === undefined ? [] : [gate];
    });

// ---------------------------------------------------------------------------
// CR-RG-02's table
// ---------------------------------------------------------------------------

const ACCESS_TAB_BAR =
  'modules/access/components/access-workspace/AccessWorkspace.tsx';
const WAREHOUSES_TAB =
  'modules/workspace/components/workspace-administration/warehouses/WarehousesTab.tsx';
const WORKSPACE_TAB_BAR =
  'modules/workspace/components/WorkspaceAdministration.tsx';

type GateSource =
  | { descriptorId: string; file: string; kind: 'descriptor' }
  | { file: string; kind: 'hook' };

type ParityRow = {
  /** Every production file that reads this dataset's query hook. */
  consumers: readonly string[];
  dataset: string;
  gateKind: 'hook skip' | 'tab descriptor' | 'unconditional' | 'verdict';
  /** The declarations the loader's own gate must reproduce. */
  gateSources: readonly GateSource[];
  loader: string;
};

/**
 * CR-RG-02's ten rows, in its own order. `listWorkspaceUsers` is **one** row and
 * one dispatch — `WarehousesTab`'s people counts and `useWorkspaceUsers`'s
 * candidate list call the same endpoint with the same argument, so they share a
 * cache entry — and both of its gate declarations are listed, because they must
 * agree with the loader and with each other.
 */
const PARITY_ROWS: readonly ParityRow[] = [
  {
    consumers: [
      'modules/warehouse/hooks/effects/useRecordWarehouseEntry.ts',
      'shared/hooks/queries/useWorkspacePermissions.ts',
    ],
    dataset: 'getWorkspaceContext',
    gateKind: 'unconditional',
    gateSources: [],
    loader: 'workspaceRoute',
  },
  {
    consumers: [WAREHOUSES_TAB],
    dataset: 'listWorkspaceWarehouses',
    gateKind: 'tab descriptor',
    gateSources: [
      {
        descriptorId: 'warehouses',
        file: WORKSPACE_TAB_BAR,
        kind: 'descriptor',
      },
    ],
    loader: 'workspaceRoute',
  },
  {
    consumers: [
      // An on-open dialog read of the row's single cache entry, not a
      // first-paint dataset: it is enumerated so its arrival was adjudicated,
      // and so a *second* ungated consumer cannot appear unnoticed.
      'modules/workspace/components/workspace-administration/warehouses/GiveWarehouseAccessDialog.tsx',
      'modules/access/hooks/queries/useWorkspaceUsers.ts',
      WAREHOUSES_TAB,
    ],
    dataset: 'listWorkspaceUsers',
    gateKind: 'hook skip',
    gateSources: [
      {
        file: 'modules/access/hooks/queries/useWorkspaceUsers.ts',
        kind: 'hook',
      },
      { file: WAREHOUSES_TAB, kind: 'hook' },
    ],
    loader: 'workspaceRoute',
  },
  {
    consumers: ['modules/access/hooks/queries/useWorkspaceMembers.ts'],
    dataset: 'listWorkspaceMembers',
    gateKind: 'hook skip',
    gateSources: [
      {
        file: 'modules/access/hooks/queries/useWorkspaceMembers.ts',
        kind: 'hook',
      },
    ],
    loader: 'workspaceRoute',
  },
  {
    consumers: ['modules/access/hooks/queries/useWorkspaceRoles.ts'],
    dataset: 'listWorkspaceRoles',
    gateKind: 'hook skip',
    gateSources: [
      {
        file: 'modules/access/hooks/queries/useWorkspaceRoles.ts',
        kind: 'hook',
      },
    ],
    loader: 'workspaceRoute',
  },
  {
    consumers: [
      'modules/access/hooks/queries/useWorkspacePermissionCatalogue.ts',
    ],
    dataset: 'listWorkspacePermissions',
    gateKind: 'hook skip',
    gateSources: [
      {
        file: 'modules/access/hooks/queries/useWorkspacePermissionCatalogue.ts',
        kind: 'hook',
      },
    ],
    loader: 'workspaceRoute',
  },
  {
    consumers: ['shared/hooks/queries/usePermissions.ts'],
    dataset: 'getCurrentAccess',
    gateKind: 'verdict',
    gateSources: [],
    loader: 'accessRoute',
  },
  {
    consumers: ['modules/access/hooks/queries/useAccessRoles.ts'],
    dataset: 'listAccessRoles',
    gateKind: 'hook skip',
    gateSources: [
      { file: 'modules/access/hooks/queries/useAccessRoles.ts', kind: 'hook' },
    ],
    loader: 'accessRoute',
  },
  {
    consumers: ['modules/access/hooks/queries/useAccessMembers.ts'],
    dataset: 'listAccessMembers',
    gateKind: 'hook skip',
    gateSources: [
      {
        file: 'modules/access/hooks/queries/useAccessMembers.ts',
        kind: 'hook',
      },
    ],
    loader: 'accessRoute',
  },
  {
    consumers: ['modules/access/hooks/queries/useAccessPermissions.ts'],
    dataset: 'listAccessPermissions',
    gateKind: 'hook skip',
    gateSources: [
      {
        file: 'modules/access/hooks/queries/useAccessPermissions.ts',
        kind: 'hook',
      },
    ],
    loader: 'accessRoute',
  },
];

const rowFor = (dataset: string): ParityRow => {
  const row = PARITY_ROWS.find((candidate) => candidate.dataset === dataset);
  if (!row) {
    throw new Error(`CR-RG-02 declares no row for ${dataset}`);
  }

  return row;
};

/** The gate expressions one row's surfaces declare, each labelled by its file. */
const surfaceGatesOf = (row: ParityRow): string[] =>
  row.gateSources.flatMap((gateSource) =>
    (gateSource.kind === 'descriptor'
      ? descriptorGateIn(gateSource.file, gateSource.descriptorId)
      : gateExpressionsIn(gateSource.file)
    ).map(
      (expression) =>
        `${gateSource.file}: ${gateFingerprint(resolveGate(expression))}`,
    ),
  );

const loaderGatesOf = (row: ParityRow): string[] =>
  dispatchOf(row.loader, row.dataset).map(({ file, gateExpression }) =>
    gateExpression === null
      ? `${file}: ungated`
      : `${file}: ${gateFingerprint(resolveGate(gateExpression))}`,
  );

// ---------------------------------------------------------------------------
// Who reads these datasets
// ---------------------------------------------------------------------------

const queryHookOf = (dataset: string): string =>
  `use${dataset.charAt(0).toUpperCase()}${dataset.slice(1)}Query`;

const productionFiles = (): string[] =>
  globSync('**/*.{ts,tsx}', { cwd: SRC_DIRECTORY })
    .map((entry) => entry.split('\\').join('/'))
    .filter((entry) => !/\.spec\.tsx?$/u.test(entry))
    .sort();

/** Every production file that *calls* one dataset's generated query hook. */
const consumersOf = (dataset: string): string[] => {
  const call = new RegExp(`\\b${queryHookOf(dataset)}\\(`, 'u');

  return productionFiles().filter((file) => call.test(sourceOf(file)));
};

// ---------------------------------------------------------------------------
// The two enumerations CR-RG-02 claims are the same, each derived from source
// ---------------------------------------------------------------------------

const endpointOf = ({ endpoint }: LoaderDispatch): string => endpoint;

/** What each loader dispatches, whatever the gate — the loader's own claim. */
const dispatchedEndpointsByLoader = (): Record<string, string[]> =>
  Object.fromEntries(
    Object.keys(LOADER_FILES).map((loader) => [
      loader,
      dispatchesOf(loader).map(endpointOf).sort(),
    ]),
  );

const gateKindEntriesOf = ({
  dataset,
  loader,
}: ParityRow): [string, string][] =>
  dispatchOf(loader, dataset).map(({ gateExpression }) => [
    dataset,
    gateExpression === null ? 'ungated in the loader' : 'gated',
  ]);

/**
 * Which rows the loader decides with a Permission and which it always issues.
 * A gate field deleted from a gated entry lands here as
 * `ungated in the loader`, which is the widening it is.
 */
const loaderGateKindByDataset = (): Record<string, string> =>
  Object.fromEntries(PARITY_ROWS.flatMap(gateKindEntriesOf));

/** Who reads each dataset today, found by scanning, not by declaration. */
const discoveredConsumersByDataset = (): Record<string, string[]> =>
  Object.fromEntries(
    PARITY_ROWS.map(({ dataset }) => [dataset, consumersOf(dataset)]),
  );

/** Who CR-RG-02 says reads it. The two must agree, file for file. */
const enumeratedConsumersByDataset = (): Record<string, string[]> =>
  Object.fromEntries(
    PARITY_ROWS.map(({ consumers, dataset }) => [
      dataset,
      [...consumers].sort(),
    ]),
  );

// ---------------------------------------------------------------------------

it('resolves a gate expression to one level, because no member name is shared (CR-RG-02)', () => {
  const members = Object.values(PERMISSION_LEVELS).flatMap((level) =>
    Object.keys(level),
  );

  expect([...new Set(members)]).toHaveLength(members.length);
  expect(resolveGate('WorkspacePermissionIdValue.WAREHOUSES_WATCH')).toEqual(
    resolveGate('WorkspacePermissionId.WAREHOUSES_WATCH'),
  );
  // An expression this cannot read must never resolve as "no Permissions",
  // or a broken extraction would compare equal to another broken one.
  expect(resolveGate('somethingElse').level).toBe('unresolved(somethingElse)');
});

it('carries CR-RG-02 whole: ten rows, three gate kinds, two loaders', () => {
  expect(PARITY_ROWS.map(({ dataset }) => dataset)).toStrictEqual([
    'getWorkspaceContext',
    'listWorkspaceWarehouses',
    'listWorkspaceUsers',
    'listWorkspaceMembers',
    'listWorkspaceRoles',
    'listWorkspacePermissions',
    'getCurrentAccess',
    'listAccessRoles',
    'listAccessMembers',
    'listAccessPermissions',
  ]);
  expect(
    PARITY_ROWS.filter(({ gateKind }) => gateKind === 'hook skip'),
  ).toHaveLength(7);
  expect(
    PARITY_ROWS.filter(({ gateKind }) => gateKind === 'tab descriptor'),
  ).toHaveLength(1);
  expect(
    PARITY_ROWS.filter(({ gateKind }) => gateKind === 'unconditional'),
  ).toHaveLength(1);
  expect(
    PARITY_ROWS.filter(({ gateKind }) => gateKind === 'verdict'),
  ).toHaveLength(1);
});

describe('the loader fetches nothing an admitted surface would not (CR-RG-02)', () => {
  it('dispatches exactly the ten enumerated datasets and no eleventh', () => {
    // Both directions in one comparison: an endpoint the loaders dispatch
    // that CR-RG-02 does not enumerate is reported as `unexpected`, and a row
    // whose loader stopped dispatching it is reported as missing.
    expect(dispatchedEndpointsByLoader()).toStrictEqual({
      accessRoute: [
        'getCurrentAccess',
        'listAccessMembers',
        'listAccessPermissions',
        'listAccessRoles',
      ],
      workspaceRoute: [
        'getWorkspaceContext',
        'listWorkspaceMembers',
        'listWorkspacePermissions',
        'listWorkspaceRoles',
        'listWorkspaceUsers',
        'listWorkspaceWarehouses',
      ],
    });
  });

  it('gates every dispatch it declares as gated, and only those', () => {
    expect(loaderGateKindByDataset()).toStrictEqual({
      getCurrentAccess: 'ungated in the loader',
      getWorkspaceContext: 'ungated in the loader',
      listAccessMembers: 'gated',
      listAccessPermissions: 'gated',
      listAccessRoles: 'gated',
      listWorkspaceMembers: 'gated',
      listWorkspacePermissions: 'gated',
      listWorkspaceRoles: 'gated',
      listWorkspaceUsers: 'gated',
      listWorkspaceWarehouses: 'gated',
    });
  });
});

describe('an admitted surface fetches nothing the loader would not (CR-RG-02)', () => {
  it('enumerates every consumer of every enumerated dataset', () => {
    // A surface that starts reading one of these datasets without the loader
    // learning of it is exactly the narrowing regression CR-RG-02 forbids, and
    // it arrives as one new file in this diff rather than as a silent one.
    expect(discoveredConsumersByDataset()).toStrictEqual(
      enumeratedConsumersByDataset(),
    );
  });

  it('names a gate source for every dataset a Permission withholds', () => {
    expect(
      PARITY_ROWS.filter(
        ({ gateKind, gateSources }) =>
          (gateKind === 'hook skip' || gateKind === 'tab descriptor') &&
          gateSources.length === 0,
      ).map(({ dataset }) => dataset),
    ).toStrictEqual([]);
  });
});

describe('every gated row reproduces its surface gate exactly (CR-RG-02)', () => {
  it.each(
    PARITY_ROWS.filter(({ gateKind }) => gateKind !== 'unconditional').filter(
      ({ gateKind }) => gateKind !== 'verdict',
    ),
  )('$dataset is gated by its $gateKind, in both directions', (row) => {
    const loaderGates = loaderGatesOf(row);
    const surfaceGates = surfaceGatesOf(row);

    expect(loaderGates).toHaveLength(1);
    expect(surfaceGates.length).toBeGreaterThan(0);

    const permissions = [...loaderGates, ...surfaceGates].map((entry) =>
      entry.slice(entry.indexOf(': ') + 2),
    );

    // One value, however many declarations: the loader's, the hook's, and —
    // for `listWorkspaceUsers` — the tab's own read, all naming the same
    // Permissions. Widening one side or narrowing it both land here.
    expect(
      new Set(permissions),
      `${row.dataset}: ${[...loaderGates, ...surfaceGates].join(' | ')}`,
    ).toHaveLength(1);
    expect(permissions[0]).not.toContain('unresolved');
  });
});

describe('the ungated listWorkspaceWarehouses row (CR-RG-02)', () => {
  const row = rowFor('listWorkspaceWarehouses');

  it('is gated by the tab descriptor, because the hook has no skip', () => {
    // The mistake this row exists to catch: measuring it against a hook skip
    // it does not have would report a false violation, and measuring it
    // against nothing at all would let the loader fetch it unconditionally.
    expect(gateExpressionsIn(WAREHOUSES_TAB)).toStrictEqual([
      'WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH',
    ]);
    expect(sourceOf(WAREHOUSES_TAB)).toContain(
      'useListWorkspaceWarehousesQuery();',
    );

    expect(descriptorGateIn(WORKSPACE_TAB_BAR, 'warehouses')).toStrictEqual([
      'WorkspacePermissionId.WAREHOUSES_WATCH',
    ]);
    expect(loaderGatesOf(row)).toStrictEqual([
      `${WORKSPACE_LOADER}: ${gateFingerprint({
        level: 'WorkspacePermissionId',
        permissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
      })}`,
    ]);
  });

  it('keeps every Workspace tab descriptor answerable by the loader', () => {
    // The tab bar is the other half of this row's gate, so a tab arriving on
    // it with a Permission no loader row reproduces is drift too.
    const declared = Array.from(
      sourceOf(WORKSPACE_TAB_BAR).matchAll(DESCRIPTOR),
      ({ groups }) => groups?.id ?? '',
    );

    expect(declared).toStrictEqual([
      'warehouses',
      'workspaceRoles',
      'members',
      'permissions',
    ]);
  });
});

describe('the unconditional and verdict rows (CR-RG-02)', () => {
  it('awaits getWorkspaceContext under no Permission, as the guard already does', () => {
    expect(loaderGatesOf(rowFor('getWorkspaceContext'))).toStrictEqual([
      `${WORKSPACE_LOADER}: ungated`,
    ]);
    expect(sourceOf('guards/workspace.guard.ts')).toContain(
      'endpoints.getWorkspaceContext.initiate(',
    );
  });

  it('issues nothing at all on an access route whose verdict is not entered', () => {
    const source = sourceOf(ACCESS_LOADER);
    const verdictGate = source.indexOf("context.status !== 'entered'");
    const firstDispatch = source.search(EVERY_ENDPOINT_DISPATCH);

    expect(
      verdictGate,
      `${ACCESS_LOADER} declares no "context.status !== 'entered'" gate, so a refused Warehouse would fetch`,
    ).toBeGreaterThan(-1);
    expect(source.slice(verdictGate)).toContain('return;');
    // The gate is the *first* thing the loader body does, so a refusal costs
    // neither the projection nor a dataset (CR-AC-14).
    expect(verdictGate).toBeLessThan(source.indexOf('await store'));
    expect(firstDispatch).toBeGreaterThan(-1);
    expect(loaderGatesOf(rowFor('getCurrentAccess'))).toStrictEqual([
      `${ACCESS_LOADER}: ungated`,
    ]);
  });
});

describe('narrowing, the likelier mistake (CR-RG-02)', () => {
  /** `ROLES:ASSIGN` and nothing else — no `ROLES:WATCH` (CR-RG-02). */
  const assigner: readonly string[] = [PermissionId.ROLES_ASSIGN];

  const admits = (dataset: string): boolean => {
    const [gate] = dispatchOf(rowFor(dataset).loader, dataset);

    return hasPermission(
      assigner,
      resolveGate(gate?.gateExpression ?? '')
        .permissionIds as readonly PermissionId[],
    );
  };

  it('still sends Roles and Members to a ROLES:ASSIGN actor without ROLES:WATCH', () => {
    expect(assigner).not.toContain(PermissionId.ROLES_WATCH);

    // Written against the gate the loader actually declares, not against the
    // constant: a loader rewritten to the single watch Permission would take
    // Roles away from this actor and break the Members list's Role-name
    // lookup (`MemberList.tsx`), which is what this case refuses.
    expect({
      listAccessMembers: admits('listAccessMembers'),
      listAccessPermissions: admits('listAccessPermissions'),
      listAccessRoles: admits('listAccessRoles'),
    }).toStrictEqual({
      listAccessMembers: true,
      listAccessPermissions: true,
      listAccessRoles: true,
    });
  });

  it('leaves the Roles tab admitting exactly what the catalogue is gated by', () => {
    // `sad.md` §4.5's identity: tab admission implies the dataset arrives.
    expect(descriptorGateIn(ACCESS_TAB_BAR, 'roles')).toStrictEqual([
      'rolesTabPermissions',
    ]);
    expect(
      gateExpressionsIn('modules/access/hooks/queries/useAccessPermissions.ts'),
    ).toStrictEqual(['rolesTabPermissions']);
  });
});

describe('the one intended widening, and only it (CR-RG-02)', () => {
  it('widens useAccessPermissions to the Roles tab set and nothing else', () => {
    const baselineCatalogueSet: readonly PermissionId[] = [
      PermissionId.ROLES_WATCH,
      PermissionId.ROLES_CREATE,
      PermissionId.ROLES_UPDATE,
    ];

    expect([...rolesTabPermissions].sort()).toStrictEqual(
      [
        PermissionId.ROLES_WATCH,
        PermissionId.ROLES_ASSIGN,
        PermissionId.ROLES_CREATE,
        PermissionId.ROLES_DELETE,
        PermissionId.ROLES_UPDATE,
        PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
      ].sort(),
    );
    expect(
      rolesTabPermissions.filter(
        (permission) => !baselineCatalogueSet.includes(permission),
      ),
    ).toStrictEqual([
      PermissionId.ROLES_ASSIGN,
      PermissionId.ROLES_DELETE,
      PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
    ]);
  });

  it('leaves the two read sets at their baseline membership', () => {
    expect([...rolesReadPermissions].sort()).toStrictEqual(
      [
        PermissionId.ROLES_WATCH,
        PermissionId.ROLES_ASSIGN,
        PermissionId.ROLES_CREATE,
        PermissionId.ROLES_DELETE,
        PermissionId.ROLES_UPDATE,
        PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
        PermissionId.USERS_WATCH,
        PermissionId.USERS_CREATE,
      ].sort(),
    );
    expect([...membersReadPermissions].sort()).toStrictEqual(
      [
        PermissionId.USERS_WATCH,
        PermissionId.ROLES_ASSIGN,
        PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN,
        PermissionId.USERS_CREATE,
        PermissionId.USERS_DELETE,
        PermissionId.USERS_EMAIL_UPDATE,
        PermissionId.USERS_PASSWORD_CHANGE,
      ].sort(),
    );
  });
});

it('dispatches listWorkspaceUsers once, into one cache entry (CR-RG-02)', () => {
  const dispatches = dispatchOf('workspaceRoute', 'listWorkspaceUsers');

  expect(dispatches).toHaveLength(1);
  // One argument, so one cache key: the Warehouses tab's people counts and
  // `useWorkspaceUsers`'s candidate list are served by the entry this filled.
  expect(dispatches[0]?.argument).toBe('undefined');
  expect(sourceOf(WAREHOUSES_TAB)).toContain(
    'useListWorkspaceUsersQuery(undefined, {',
  );
  expect(
    sourceOf('modules/access/hooks/queries/useWorkspaceUsers.ts'),
  ).toContain('useListWorkspaceUsersQuery(undefined, {');
});
