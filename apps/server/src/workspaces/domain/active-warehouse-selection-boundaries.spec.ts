import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// T23 DoD: "nothing in this task is ever consulted by a guard or another use
// case for an authorization decision." The Active Warehouse selection is
// presentation state (spec.md §6.1 "Stale selection"; sad.md §6.8): no guard
// and no use case other than `SetActiveWarehouseCommand` and
// `ReadWorkspaceContextQuery` themselves may read `users.active_warehouse_id`
// (`activeWarehouseId`), the effective selection (`effectiveWarehouseId`), or
// import `ActiveWarehouseSelectionRepository`. Mirrors
// `workspaces/domain/module-boundaries.spec.ts`'s static-source-scan style —
// a source scan rather than a DB-backed integration suite, since this is a
// static architectural guarantee, not a runtime one.

const serverSourceDirectory = join(import.meta.dirname, '..', '..');

const guardsDirectory = join(serverSourceDirectory, 'shared', 'guards');

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

const collectUseCaseFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      return collectUseCaseFiles(entryPath);
    }
    return entry.endsWith('.ts') &&
      !entry.endsWith('.spec.ts') &&
      entryPath.includes(`${join('usecases')}${'/'}`)
      ? [entryPath]
      : [];
  });

// The task's own two files legitimately read/derive the selection; every
// other guard and use case must not.
const exemptFiles = new Set([
  join(
    serverSourceDirectory,
    'workspaces',
    'usecases',
    'commands',
    'set-active-warehouse.command.ts',
  ),
  join(
    serverSourceDirectory,
    'workspaces',
    'usecases',
    'queries',
    'read-workspace-context.query.ts',
  ),
]);

const guardFiles = collectTsFiles(guardsDirectory);
const useCaseFiles = collectUseCaseFiles(serverSourceDirectory);

const scannedFiles = Array.from(
  new Set([...guardFiles, ...useCaseFiles]),
).filter((filePath) => !exemptFiles.has(filePath));

describe('active Warehouse selection stays presentation-only', () => {
  const sources = scannedFiles.map((filePath) => ({
    filePath,
    source: readFileSync(filePath, 'utf8'),
  }));

  it('discovers at least one guard and one other use case to scan', () => {
    expect(guardFiles.length).toBeGreaterThan(0);
    expect(useCaseFiles.length).toBeGreaterThan(exemptFiles.size);
  });

  it.each(sources)(
    '$filePath never reads the stored or effective Active Warehouse selection',
    ({ source }) => {
      expect(source).not.toMatch(/activeWarehouseId/u);
      expect(source).not.toMatch(/effectiveWarehouseId/u);
      expect(source).not.toMatch(/ActiveWarehouseSelectionRepository/u);
    },
  );
});
