import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// T4 DoD: "`apps/server/src/workspaces/domain/` has zero NestJS, HTTP and
// TypeORM imports" and "`workspaces` imports no `access` domain internals".
// Mirrors `users/module-boundaries.spec.ts`'s static-source-scan style
// (`readdirSync`/`readFileSync` + regex) rather than a runtime dependency-graph
// tool, since no such tool exists in this repo yet. T30 adds the repo-wide
// architecture check separately; this is the narrower, domain-local assertion
// the task card asks for.

const domainDirectory = __dirname;

const collectTsFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      return collectTsFiles(entryPath);
    }
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts')
      ? [entryPath]
      : [];
  });

describe('workspaces/domain module boundaries', () => {
  const domainSources = collectTsFiles(domainDirectory).map((filePath) => ({
    filePath,
    source: readFileSync(filePath, 'utf8'),
  }));

  // `domain/services/` is exempt from the framework-free scan below: per
  // `docs/system/server-architecture.md` ("Services"), injectable business
  // services live under `<feature>/domain/services/` and use NestJS DI —
  // mirroring the accepted `access/domain/services/role-deletion.service.ts`
  // (T17). The framework-free constraint applies to domain entities and
  // value objects, not services.
  const frameworkFreeDomainSources = domainSources.filter(
    ({ filePath }) => !filePath.includes(`${join('domain', 'services')}`),
  );

  it('discovers at least one source file under workspaces/domain/', () => {
    // Guards against the scan silently passing over an empty/misnamed
    // directory once the predicates, errors, entities and value objects exist.
    expect(domainSources.length).toBeGreaterThan(0);
  });

  it.each(frameworkFreeDomainSources)(
    '$filePath imports no NestJS, HTTP, or TypeORM',
    ({ source }) => {
      expect(source).not.toMatch(/from\s+['"]@nestjs\//u);
      expect(source).not.toMatch(/from\s+['"]typeorm['"]/u);
      expect(source).not.toMatch(/from\s+['"]http['"]/u);
      expect(source).not.toMatch(/from\s+['"]node:http['"]/u);
    },
  );

  it.each(domainSources)(
    '$filePath imports no access/domain internals',
    ({ source }) => {
      expect(source).not.toMatch(/from\s+['"]access\/domain\//u);
    },
  );
});
