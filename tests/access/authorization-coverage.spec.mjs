import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import test from 'node:test';

const controllerFiles = globSync('apps/server/src/**/*.controller.ts');

test('authenticated business controllers declare warehouse authorization classification', () => {
  const unclassified = controllerFiles.filter((file) => {
    if (file.includes('/auth/')) return false;
    const source = readFileSync(file, 'utf8');

    return !source.includes('RequiredPermission') && !source.includes('InfrastructureAccess');
  });

  assert.ok(controllerFiles.length > 0, 'expected controller files to classify');
  assert.deepEqual(unclassified, []);
});
