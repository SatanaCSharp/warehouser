import { cruiseWeb, cruiseWebGraph } from 'test/architectural/web-graph';
import { describe, expect, it } from 'vitest';

/**
 * The spec that guards the rest of the tier.
 *
 * Every other architectural spec phrases its rule as *files under here must not
 * reach files under there*, and a rule like that is vacuously satisfied when
 * the resolver cannot tell where a specifier points. `apps/web` writes its
 * internal imports against `tsconfig.json`'s `"*" -> "./src/*"` mapping, so a
 * resolver misconfiguration does not fail loudly: it silently drops every
 * `modules/...`, `shared/...` and `store/...` edge from the graph and the whole
 * tier reports green.
 *
 * These three assertions are what make the green meaningful.
 */
describe('module graph resolution', () => {
  it('resolves every import in the tree', async () => {
    const violations = await cruiseWeb({
      forbidden: [
        {
          name: 'no-unresolvable',
          severity: 'error',
          from: {},
          to: {
            couldNotResolve: true,
            // `main.tsx` writes `import 'src/styles/global.css'`, which reaches
            // the file through Vite's `src` alias. TypeScript accepts it
            // through `vite/client`'s ambient `*.css` declaration rather than
            // through `tsconfig.json`'s path mapping, so neither `tsc` nor the
            // bundler minds and only this resolver does. A stylesheet is a
            // side-effect import, not an edge in the module graph no rule here
            // reasons about.
            pathNot: '\\.css$',
          },
        },
      ],
    });

    expect(violations).toEqual([]);
  });

  it('cruises the whole production tree, not a fragment of it', async () => {
    const { modules } = await cruiseWebGraph();

    expect(modules.length).toBeGreaterThan(500);
  });

  it('resolves bare internal specifiers to files under src', async () => {
    const { modules } = await cruiseWebGraph();

    // `modules/...`, `shared/...` and `store/...` are bare specifiers, not
    // relative paths: they only land inside `src` because the resolver reads
    // `tsconfig.json`. If that mapping were lost they would resolve to
    // themselves, and every path-based rule in this tier would match nothing.
    const bareInternalEdges = modules
      .flatMap((module) => module.dependencies)
      .filter((dependency) =>
        /^(?:modules|shared|store|guards|routes)\//u.test(dependency.module),
      );

    expect(bareInternalEdges.length).toBeGreaterThan(0);
    expect(
      bareInternalEdges.filter(
        (dependency) => !dependency.resolved.startsWith('src/'),
      ),
    ).toEqual([]);
  });
});
