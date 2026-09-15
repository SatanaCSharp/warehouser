import { fileURLToPath } from 'node:url';

import type {
  ICruiseOptions,
  ICruiseResult,
  IFlattenedRuleSet,
  IReporterOutput,
  IViolation,
} from 'dependency-cruiser';
import { cruise } from 'dependency-cruiser';

/**
 * The one place the module graph of `apps/web/src` is built.
 *
 * Every architectural spec asks dependency-cruiser the same question — *what
 * does this file import, and what resolves to what* — and differs only in the
 * rules it judges the answer by. Cruising is the expensive half (it parses
 * every production file), so a spec declares rules and calls
 * {@link cruiseWeb}; it never configures a resolver.
 */

/**
 * `apps/web`, resolved from this file rather than from `process.cwd()`: Vitest
 * runs with the package as its root today, but a spec that assumes so breaks
 * the moment the tier is invoked from the repository root.
 */
const webRoot = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * The resolver half of the configuration, shared by every spec and stated once.
 *
 * `tsConfig` is not optional. `apps/web/tsconfig.json` maps `"*"` to
 * `"./src/*"`, which is what lets a file name `modules/warehouse/...` instead
 * of climbing back up with `../../`. Without it dependency-cruiser resolves
 * none of those specifiers, every `to` clause matches nothing, and the whole
 * tier passes while checking precisely nothing — the one failure mode these
 * specs cannot detect themselves, which is why
 * `resolution.architectural.spec.ts` asserts the graph resolved before any
 * other spec trusts it.
 *
 * `tsPreCompilationDeps` keeps `import type` edges in the graph. A boundary
 * crossed by a type is still crossed: `modules/a` naming a type owned by
 * `modules/b` couples the two exactly as a value import does, and erasing the
 * edge at compile time does not uncouple them.
 */
const RESOLVER_OPTIONS = {
  baseDir: webRoot,
  // Required, and silently so. Without `validate`, `cruise()` still builds the
  // whole graph, still accepts the rule set, and still returns a result whose
  // `summary.violations` is `[]` — it simply never evaluates a rule. Every spec
  // in this tier would report green against any rule set at all, including a
  // deliberately broken one. The CLI sets this flag itself whenever a config
  // carries rules, which is why the same rules pass through `depcruise` and go
  // quiet through the API.
  validate: true,
  // `doNotFollow`, and deliberately not `exclude`. `doNotFollow` stops the
  // cruise at a package boundary — the edge into `react` is recorded, its
  // 900 internal files are not. `exclude: { path: 'node_modules' }` looks like
  // the same economy and is not: it deletes the npm modules from the graph
  // outright, and with them every edge pointing at one. Every rule in
  // `DEPENDENCY_RULES` then matches nothing and reports green, which is what it
  // did here until `rule-teeth.architectural.spec.ts` was written.
  doNotFollow: { path: 'node_modules' },
  tsPreCompilationDeps: true,
  tsConfig: { fileName: 'tsconfig.json' },
  enhancedResolveOptions: {
    exportsFields: ['exports'],
    conditionNames: ['import', 'require', 'node', 'default', 'types'],
    // `.css` belongs here: `main.tsx` imports `styles/global.css`, and without
    // the extension that import is unresolvable — which
    // `resolution.architectural.spec.ts` reports as a broken graph.
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.css'],
  },
} satisfies ICruiseOptions;

const isCruiseResult = (
  output: IReporterOutput['output'],
): output is ICruiseResult => typeof output !== 'string';

/**
 * Cruises `src` under `ruleSet` and returns the violations it produced.
 *
 * Returning violations rather than asserting on them keeps the judgement in the
 * spec: a rule's expectation, its failure message and its documented exceptions
 * belong next to the rule, not in here.
 */
export const cruiseWeb = async (
  ruleSet: IFlattenedRuleSet,
): Promise<IViolation[]> => {
  const result = await cruise(['src'], { ...RESOLVER_OPTIONS, ruleSet });

  if (!isCruiseResult(result.output)) {
    throw new Error(
      'dependency-cruiser returned a formatted report, not a cruise result',
    );
  }

  return result.output.summary.violations;
};

/**
 * Cruises `src` with no rules at all and returns the raw graph, for the specs
 * that ask a question dependency-cruiser's rule language cannot phrase.
 */
export const cruiseWebGraph = async (): Promise<ICruiseResult> => {
  const result = await cruise(['src'], {
    ...RESOLVER_OPTIONS,
    ruleSet: { forbidden: [] },
  });

  if (!isCruiseResult(result.output)) {
    throw new Error(
      'dependency-cruiser returned a formatted report, not a cruise result',
    );
  }

  return result.output;
};

/**
 * Renders violations as `rule: from -> to` lines.
 *
 * Every spec asserts `expect(await describeViolations(rules)).toEqual([])`
 * rather than checking a count, because a count that fails prints `1 !== 0` and
 * a list prints the import that has to be removed.
 */
export const describeViolations = async (
  ruleSet: IFlattenedRuleSet,
): Promise<string[]> =>
  (await cruiseWeb(ruleSet)).map(
    (violation) =>
      `${violation.rule.name}: ${violation.from} -> ${violation.to}`,
  );
