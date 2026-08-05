import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repositoryDirectory = __dirname;
const commandDirectory = join(__dirname, '../../../access/usecases/commands');

describe('shared repository boundaries', () => {
  const repositorySources = readdirSync(repositoryDirectory)
    .filter((fileName) => fileName.endsWith('.repository.ts'))
    .map((fileName) => ({
      fileName,
      source: readFileSync(join(repositoryDirectory, fileName), 'utf8'),
    }));

  it.each(repositorySources)(
    '$fileName uses TypeORM APIs instead of raw queries',
    ({ source }) => {
      expect(source).not.toMatch(/\.query\s*(?:<[^;]+?>)?\s*\(/su);
    },
  );

  it.each(repositorySources)(
    '$fileName leaves exception translation outside persistence',
    ({ source }) => {
      expect(source).not.toMatch(/\btry\s*\{/u);
      expect(source).not.toMatch(/\bcatch\s*\(/u);
    },
  );

  const commandSources = readdirSync(commandDirectory)
    .filter((fileName) => fileName.endsWith('.command.ts'))
    .map((fileName) => ({
      fileName,
      source: readFileSync(join(commandDirectory, fileName), 'utf8'),
    }));

  it.each(commandSources)(
    '$fileName delegates exception handling to the global filter',
    ({ source }) => {
      expect(source).not.toMatch(/\btry\s*\{/u);
      expect(source).not.toMatch(/\bcatch\s*\(/u);
    },
  );
});
