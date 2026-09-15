import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { ICruiseResult, IFlattenedRuleSet } from 'dependency-cruiser';
import { cruise } from 'dependency-cruiser';
import { cruiseWeb, cruiseWebGraph } from 'test/architectural/web-graph';
import {
  ALL_FORBIDDEN_RULES,
  REQUIRED_RULES,
} from 'test/architectural/web-rules';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The spec that makes every other spec in this tier mean something.
 *
 * Each of the others asserts that a rule produced no violations. That is the
 * same observation you get from a rule whose `to` pattern matches nothing at
 * all — and a dependency-cruiser rule is easy to get wrong in exactly that
 * direction, because a path pattern is written against what the *resolver*
 * produces, not against what a file wrote. Three real examples, all of which
 * reported green before this spec existed:
 *
 * - `exclude: { path: 'node_modules' }` in the cruise options deletes every npm
 *   module from the graph and every edge into one with it. All eleven rules in
 *   `DEPENDENCY_RULES` matched nothing.
 * - `@reduxjs/toolkit/query` resolves to `@reduxjs/toolkit/dist/query/…`, so a
 *   pattern naming the specifier missed the only import it existed to find.
 * - pnpm resolves a package to `node_modules/.pnpm/<name>@<version>/node_modules/<name>/…`,
 *   so any package pattern anchored with `^` matches nothing.
 *
 * So this spec drives the rules the other way round and requires each one to
 * fire. It does that two ways, because the two kinds of rule can only be proven
 * two different ways.
 */

/**
 * A miniature `apps/web` written to a temporary directory, in which every
 * forbidden import actually exists.
 *
 * The tree is cruised with `baseDir` pointing at it, so its files resolve to
 * `src/modules/…` exactly as the real ones do and the real rule objects apply
 * unchanged. It is built at run time rather than committed because these files
 * are deliberate violations: committed under `src/` they would be type-checked
 * by `tsc`, linted at `--max-warnings=0`, and — being violations — caught by
 * this tier's own rules.
 *
 * Imports are relative here. The real tree writes `shared/…`, which resolves
 * only through `apps/web/tsconfig.json`; a fixture that needed that mapping
 * would be testing the resolver instead of the rules.
 */
const FIXTURE_FILES: Record<string, string> = {
  // Composition layer, so a module has something to reach back into.
  'src/router.ts':
    "import { Page } from './__MODULES__/alpha/page';\nexport const router = Page;\n",
  'src/store/index.ts':
    "import { pick } from '../__MODULES__/alpha/store/alpha.selectors';\nexport const store = pick;\n",
  'src/store/hooks.ts': 'export const useAppSelector = () => undefined;\n',
  'src/test/render.tsx': 'export const render = () => undefined;\n',
  'src/guards/alpha.guard.ts':
    "import 'react';\nexport const alphaGuard = () => undefined;\n",
  'src/shared/constants/routes.ts':
    'export const ROUTES = { alpha: "/alpha" };\n',
  'src/shared/utils/field-errors.ts':
    'export const fieldErrorsForCode = () => undefined;\n',
  'src/shared/alerts/mutation-actions.ts':
    'export const MUTATION_ACTIONS = {};\n',
  'src/shared/components/DialogHost.tsx':
    'export const DialogHost = () => null;\n',
  'src/shared/api/client/api-client.ts': 'export const api = {};\n',
  'src/shared/run-mutation.ts': 'export const runMutation = () => undefined;\n',
  'public/locales/en/alpha.json': '{}\n',

  // A module that violates every module-side rule at once.
  'src/modules/alpha/page.tsx':
    "import { AlphaProvider } from './context/AlphaProvider';\nexport const Page = AlphaProvider;\n",
  'src/modules/alpha/route.tsx':
    "import { Page } from './page';\nimport { alphaApi } from './api/alpha-api';\nexport const route = { Page, alphaApi };\n",
  'src/modules/alpha/api/alpha-api.ts':
    "import 'react-i18next';\nimport { api } from '../../../shared/api/client/api-client';\nexport const alphaApi = api;\n",
  'src/modules/alpha/loaders/alpha.loader.ts':
    "import { Widget } from '../components/owner-one/Widget';\nimport { alphaGuard } from '../../../guards/alpha.guard';\nexport const loader = () => [Widget, alphaGuard];\n",
  'src/modules/alpha/store/alpha.actions.ts':
    "import { alphaSlice } from './alpha.slice';\nexport const reset = () => alphaSlice;\n",
  'src/modules/alpha/store/alpha.slice.ts': 'export const alphaSlice = {};\n',
  'src/modules/alpha/store/alpha.selectors.ts':
    'export const pick = () => undefined;\n',
  'src/modules/alpha/context/AlphaProvider.tsx':
    "import { alphaApi } from '../api/alpha-api';\nexport const AlphaProvider = () => alphaApi;\n",
  'src/modules/alpha/components/owner-one/Widget.tsx':
    "import { Hidden } from '../owner-two/components/Hidden';\n" +
    "import { fieldErrorsForCode } from '../../../../shared/utils/field-errors';\n" +
    "import { MUTATION_ACTIONS } from '../../../../shared/alerts/mutation-actions';\n" +
    "import { DialogHost } from '../../../../shared/components/DialogHost';\n" +
    "import { runMutation } from '../../../../shared/run-mutation';\n" +
    "import { router } from '../../../../router';\n" +
    "import { render } from '../../../../test/render';\n" +
    "import { useRecordWarehouseEntry } from '../../../warehouse/hooks/effects/useRecordWarehouseEntry';\n" +
    "import copy from '../../../../../public/locales/en/alpha.json';\n" +
    "import 'react-redux';\nimport 'i18next';\nimport 'axios';\nimport 'yup';\nimport '@mui/material';\n" +
    "import 'lodash';\nimport '@warehouser/contracts';\nimport '@hookform/resolvers/yup';\n" +
    "import '@reduxjs/toolkit/dist/query';\nimport 'stub-dev-only';\n" +
    'export const Widget = () => [Hidden, fieldErrorsForCode, MUTATION_ACTIONS, DialogHost, runMutation, router, render, useRecordWarehouseEntry, copy];\n',
  'src/modules/alpha/components/owner-two/components/Hidden.tsx':
    'export const Hidden = () => null;\n',

  // The two ends of a runtime cycle, and a file nothing touches.
  'src/modules/alpha/utils/ping.ts':
    "import { pong } from './pong';\nexport const ping = () => pong;\n",
  'src/modules/alpha/utils/pong.ts':
    "import { ping } from './ping';\nexport const pong = () => ping;\n",
  'src/shared/utils/nobody-imports-this.ts': 'export const stranded = 1;\n',

  // The module whose single outside consumer the placement tiebreak rests on.
  'src/modules/warehouse/hooks/effects/useRecordWarehouseEntry.ts':
    'export const useRecordWarehouseEntry = () => undefined;\n',

  // A shared layout reaching the composition root.
  'src/shared/layouts/Root.tsx':
    "import { store } from '../../store/index';\nexport const Root = () => store;\n",

  // An importer that sits in no owner's directory, reaching into one.
  'src/modules/alpha/components/Panel.tsx':
    "import { Hidden } from './owner-two/components/Hidden';\nexport const Panel = () => Hidden;\n",

  // shared/alerts reaching into a module.
  'src/shared/alerts/alpha-feedback.ts':
    "import { pick } from '../../__MODULES__/alpha/store/alpha.selectors';\nexport const feedback = pick;\n",
};

/** Packages the fixture imports, stubbed so the resolver produces a real path. */
const FIXTURE_PACKAGES = [
  'react',
  'react-redux',
  'react-i18next',
  'i18next',
  'axios',
  'yup',
  '@mui/material',
  'lodash',
  '@warehouser/contracts',
  '@hookform/resolvers/yup',
  '@reduxjs/toolkit/dist/query',
  'stub-dev-only',
];

let fixtureRoot = '';

/**
 * `__MODULES__` stands in for `modules` in every fixture specifier that would
 * otherwise read as a real one, and is substituted back on the way to disk.
 *
 * `src/test/module-boundaries/module-boundaries.spec.ts` enforces the module
 * surface by scanning spec files as **text** with a regex, which cannot tell a
 * fixture's quoted source from the importing file's own imports. Spelled
 * literally, the three specifiers below make that spec report this file as
 * reaching into a module named `alpha` that does not exist. The token keeps the
 * fixture honest on disk and invisible to a text scan.
 */
const write = (relativePath: string, contents: string): void => {
  const absolute = join(fixtureRoot, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents.replaceAll('__MODULES__', 'modules'));
};

const cruiseFixtureFromCwd = async (
  ruleSet: IFlattenedRuleSet,
): Promise<string[]> => {
  const result = await cruise(['src'], {
    baseDir: fixtureRoot,
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    // See `web-graph.ts`: without this, no rule is ever evaluated.
    validate: true,
    // The fixture writes relative, extensionless specifiers, so the resolver
    // has to be told which extensions to try. Without this every fixture edge
    // is unresolvable, nothing matches a `to` clause, and this spec reports
    // that no rule has teeth — which is indistinguishable from the rules
    // genuinely being broken.
    enhancedResolveOptions: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    },
    ruleSet,
  });

  const output = result.output as ICruiseResult;

  return output.summary.violations.map((violation) => violation.rule.name);
};

/**
 * Cruises the fixture from inside it.
 *
 * `baseDir` alone is not enough: it decides which directory the file list is
 * taken from, but the resolver still reports a resolved path relative to
 * `process.cwd()`. The fixture's own files then come back as `src/modules/…`
 * while everything they import comes back as `../../../../private/var/folders/…`,
 * so a `to` clause anchored at `^src/` matches nothing and every path-based
 * rule looks toothless. Changing the working directory for the duration makes
 * both halves agree.
 */
const cruiseFixture = async (ruleSet: IFlattenedRuleSet): Promise<string[]> => {
  const callerCwd = process.cwd();
  process.chdir(fixtureRoot);

  try {
    return await cruiseFixtureFromCwd(ruleSet);
  } finally {
    process.chdir(callerCwd);
  }
};

beforeAll(() => {
  // `realpathSync`, because on macOS `tmpdir()` is `/var/folders/…`, a symlink
  // to `/private/var/folders/…`. `process.chdir` follows the link and reports
  // the real path, so without this the cruise's working directory and
  // `fixtureRoot` disagree by that prefix and every resolved path comes back
  // relative to a directory the fixture does not appear to be in.
  fixtureRoot = realpathSync(
    mkdtempSync(join(tmpdir(), 'web-architectural-teeth-')),
  );

  // `stub-dev-only` is declared as a devDependency so the npm-dev rule has
  // something to classify; every other stub is a plain dependency.
  write(
    'package.json',
    JSON.stringify({
      name: 'teeth-fixture',
      dependencies: Object.fromEntries(
        FIXTURE_PACKAGES.filter((name) => name !== 'stub-dev-only').map(
          (name) => [
            name
              .split('/')
              .slice(0, name.startsWith('@') ? 2 : 1)
              .join('/'),
            '1.0.0',
          ],
        ),
      ),
      devDependencies: { 'stub-dev-only': '1.0.0' },
    }),
  );

  for (const specifier of FIXTURE_PACKAGES) {
    // `@warehouser/contracts` is deliberately left unstubbed. The real package
    // publishes no root `exports` entry, so a root import resolves to nothing
    // and the rule matches the bare specifier; stubbing it here would give it a
    // resolved path the real one never has and prove the wrong thing.
    if (specifier === '@warehouser/contracts') {
      continue;
    }

    write(`node_modules/${specifier}/package.json`, '{"main":"index.js"}');
    write(`node_modules/${specifier}/index.js`, 'module.exports = {};\n');
  }

  for (const [path, contents] of Object.entries(FIXTURE_FILES)) {
    write(path, contents);
  }
});

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('every forbidden rule has teeth', () => {
  it('fires on a tree built to violate all of them', async () => {
    const fired = new Set(
      await cruiseFixture({ forbidden: ALL_FORBIDDEN_RULES }),
    );

    const silent = ALL_FORBIDDEN_RULES.map((rule) => rule.name).filter(
      (name) => !fired.has(name as string),
    );

    expect(silent).toEqual([]);
  });
});

describe('every required rule has teeth', () => {
  it('fires on a slice and a route that declare nothing', async () => {
    const fired = new Set(await cruiseFixture({ required: REQUIRED_RULES }));

    const silent = REQUIRED_RULES.map((rule) => rule.name).filter(
      (name) => !fired.has(name as string),
    );

    expect(silent).toEqual([]);
  });
});

/**
 * The second proof, for the rules the fixture can only show in miniature.
 *
 * A rule like `rtk-query-is-configured-at-one-boundary` names a path the
 * resolver produces from a real package's `exports` map. The fixture stubs that
 * package, so it proves the *rule* is shaped right without proving the
 * *pattern* still matches what pnpm and RTK actually produce today. These cases
 * drive the rule against the real tree with its `from` inverted to the one
 * importer the rule exempts: the sanctioned importer must trip it. If the
 * resolved layout ever moves, this fails instead of the rule going quiet.
 */
describe('each exempted importer trips the rule that exempts it', () => {
  const sanctioned: { rule: string; from: string }[] = [
    {
      rule: 'rtk-query-is-configured-at-one-boundary',
      from: '^src/shared/api/client/',
    },
    {
      rule: 'the-feedback-registry-has-one-reader',
      from: '^src/store/middleware/mutation-feedback\\.middleware\\.ts$',
    },
    {
      rule: 'warehouse-entry-hook-has-one-outside-consumer',
      from: '^src/shared/layouts/WarehouseLayout\\.tsx$',
    },
    { rule: 'i18next-is-configured-at-one-boundary', from: '^src/i18n\\.ts$' },
    {
      rule: 'locale-json-is-served-not-imported',
      from: '^src/test/setup\\.ts$',
    },
    {
      rule: 'typed-store-hooks-are-the-only-store-access',
      from: '^src/store/hooks\\.ts$',
    },
    {
      rule: 'field-error-mapping-belongs-to-the-endpoint',
      from: '^src/modules/[^/]+/api/',
    },
  ];

  it.each(sanctioned)('$rule', async ({ rule, from }) => {
    const declared = ALL_FORBIDDEN_RULES.find(
      (candidate) => candidate.name === rule,
    );

    expect(declared, `no rule named ${rule}`).toBeDefined();

    const violations = await cruiseWeb({
      forbidden: [{ ...declared!, from: { path: from } }],
    });

    expect(violations.length).toBeGreaterThan(0);
  });
});

/**
 * The npm half of the graph is present at all.
 *
 * This is the single assertion that would have caught the `exclude` option
 * deleting every package edge, and it is cheap enough to keep as a standing
 * guard rather than a note in a comment.
 */
describe('the cruise keeps npm edges', () => {
  it('records the packages apps/web actually depends on', async () => {
    const { modules } = await cruiseWebGraph();

    const packagePaths = modules
      .flatMap((module) => module.dependencies)
      .map((dependency) => dependency.resolved)
      .filter((resolved) => resolved.includes('node_modules/'));

    expect(packagePaths.length).toBeGreaterThan(0);

    // pnpm resolves through `.pnpm/<name>@<version>/node_modules/<name>/…`, so
    // a package pattern must be anchored on a path boundary and never with `^`.
    expect(
      packagePaths.some((resolved) =>
        /(?:^|\/)node_modules\/react(?:\/|$)/u.test(resolved),
      ),
    ).toBe(true);
  });
});
