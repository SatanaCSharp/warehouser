import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// T9 — the executable form of the DoD's last bullet: "an architecture check proves the service is
// reachable only through the module's declared public surface, and that customer-orders does not
// import purchase-drafts". `customer-orders/usecases/usecase.module.ts` does not exist yet, so this
// is a legitimate RED: `DemandAllocationService` has no declared public surface for
// `purchase-drafts` to reach it through (ADR 0002 "The edge is one-directional").
//
// This follows `access/module-boundaries.spec.ts`'s static-source-scan idiom (`readdirSync`/
// `readFileSync` + regex), narrowed to the two rules this task's DoD actually names rather than
// reproducing that spec's full generality — `on-hand-write-boundary.spec.ts` sets the precedent for
// a narrower, task-scoped boundary spec of this shape.
const moduleDirectory = __dirname;
const sourceRoot = join(__dirname, '..');
const usecaseModulePath = join(
  moduleDirectory,
  'usecases',
  'usecase.module.ts',
);

// The module list is exactly the directories directly under `src/`
// (adr/14-08-2026-domain-owned-flat-modules.md §Flatness). `purchase-drafts` does not exist in the
// tree yet, but the rule is about the *source text* this module is allowed to contain, which does
// not depend on the sibling existing.
const FORBIDDEN_SIBLING = 'purchase-drafts';

const collectProductionSources = (
  directory: string,
): Array<{ path: string; source: string }> =>
  readdirSync(directory).flatMap((entry) => {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      return collectProductionSources(absolute);
    }
    if (!entry.endsWith('.ts') || entry.includes('.spec.')) {
      return [];
    }
    return [
      {
        path: absolute.slice(sourceRoot.length + 1),
        source: readFileSync(absolute, 'utf8'),
      },
    ];
  });

// Catches both spellings of the dependency: a bare specifier (intra-application imports resolve
// through `baseUrl: ./src`) and a relative traversal out of `customer-orders/` into the sibling.
const forbiddenSiblingImportPattern = new RegExp(
  `from\\s+['"](?:\\.\\.\\/)*${FORBIDDEN_SIBLING}\\/`,
  'u',
);

describe('customer-orders module boundaries', () => {
  const productionSources = collectProductionSources(moduleDirectory);

  it('discovers at least one production source file under customer-orders/', () => {
    // Guards against the scan silently passing over an empty or misnamed directory.
    expect(productionSources.length).toBeGreaterThan(0);
  });

  // ADR 0002 "The edge is one-directional" — `purchase-drafts` may import `customer-orders`'
  // exported service; `customer-orders` never imports `purchase-drafts` back.
  it('imports nothing from purchase-drafts anywhere in the module', () => {
    const offenders = productionSources.filter(({ source }) =>
      forbiddenSiblingImportPattern.test(source),
    );

    expect(offenders.map(({ path }) => path)).toEqual([]);
  });

  it('rejects a fixture that does import from purchase-drafts, proving the pattern has teeth', () => {
    expect(
      forbiddenSiblingImportPattern.test(
        "import { ConfirmPurchaseDraftArrivalCommand } from 'purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command';",
      ),
    ).toBe(true);
    expect(
      forbiddenSiblingImportPattern.test(
        "import { ConfirmPurchaseDraftArrivalCommand } from '../../../purchase-drafts/usecases/commands/confirm-purchase-draft-arrival.command';",
      ),
    ).toBe(true);
  });

  // ADR 0002 / server-architecture.md "NestJS modules and exports" — `purchase-drafts` obtains the
  // `DemandAllocationService` *instance* only through `customer-orders/usecases/usecase.module.ts`'s
  // `exports`: it imports `CustomerOrdersUsecaseModule` rather than re-declaring the provider, so
  // there is one instance and one dependency edge. It still imports the class symbol from its
  // defining file, because `emitDecoratorMetadata` needs a real constructor reference as the DI
  // token; that import is the token, not a second path to the behaviour. This assertion is what
  // keeps the provider on the module's declared public surface.
  it('exports DemandAllocationService from the use-case module', () => {
    const source = readFileSync(usecaseModulePath, 'utf8');
    const exportsBlock = /exports:\s*\[(?<providers>[^\]]*)\]/u.exec(source);

    expect(exportsBlock?.groups?.providers).toMatch(
      /\bDemandAllocationService\b/u,
    );
  });
});
