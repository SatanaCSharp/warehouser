import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// T13 DoD: "users imports no `access/*` or `auth/*` feature-owned file" and
// "`UsersModule` is registered in `AppModule`". This mirrors
// `shared/domain/repositories/repository-boundaries.spec.ts`'s static-source-
// scan style (`readdirSync`/`readFileSync` + regex) rather than a runtime
// dependency-graph tool, since no such tool exists in this repo yet.

const usersDirectory = __dirname;
const appModulePath = join(__dirname, '../app.module.ts');

const collectTsFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      return collectTsFiles(entryPath);
    }
    // Only production source is boundary-checked here. `*.spec.ts` files
    // (including `*.integration.spec.ts`) legitimately import cross-feature
    // commands/repositories for test setup/fixtures (e.g. AC-15's race test
    // exercises `access`'s own `TransferWarehouseManagerCommand` against a
    // concurrent `DeleteMemberCommand`) — that is test-only coupling, not the
    // production import boundary this DoD item targets.
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts')
      ? [entryPath]
      : [];
  });

describe('users module boundaries', () => {
  const usersSources = collectTsFiles(usersDirectory).map((filePath) => ({
    filePath,
    source: readFileSync(filePath, 'utf8'),
  }));

  it('discovers at least one source file under users/', () => {
    // Guards against the scan silently passing over an empty/misnamed
    // directory once UsersController/UsersModule exist.
    expect(usersSources.length).toBeGreaterThan(0);
  });

  it.each(usersSources)(
    '$filePath imports no access/* or auth/* feature-owned file',
    ({ source }) => {
      expect(source).not.toMatch(/from\s+['"]access\//u);
      expect(source).not.toMatch(/from\s+['"]auth\//u);
    },
  );

  it('registers UsersModule in AppModule', () => {
    const appModuleSource = readFileSync(appModulePath, 'utf8');
    expect(appModuleSource).toMatch(
      /import\s*\{[^}]*\bUsersModule\b[^}]*\}\s*from\s*['"]users['"]|from\s*['"]users\/users\.module['"]/u,
    );
    expect(appModuleSource).toMatch(/imports:\s*\[[^\]]*\bUsersModule\b/su);
  });
});
