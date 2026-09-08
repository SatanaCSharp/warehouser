import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import test from 'node:test';

// T14, check 2 — arrival-inspection sad.md §4 "The Rejection Reason catalogue is the Packaging
// Type catalogue's shape, with one rule added": "no migration ever updates or deletes a catalogue
// row, so a Rejection storing the Reason's identifier can never have its wording change beneath it
// and AC-23a holds structurally rather than by a snapshot column." data-model.md records why
// PostgreSQL itself cannot enforce this: `ON DELETE RESTRICT` on
// `fk_purchase_draft_line_rejections_reason` stops a *delete* of a named Reason that is still in
// use, but nothing in the schema stops an `UPDATE … SET label = …`, and only a trigger or a revoked
// privilege — neither of which this repository has — would. This check is the enforcement
// sad.md §10 "Architecture" names: "no migration updates or deletes a `rejection_reasons` row".
//
// **This is a source-text architecture gate, not a functional migration test.** `apps/server/AGENTS.md`
// says "Do not write tests for migrations" and means it about *executing* migration logic — the
// repository's migrations are verified against a real database by applying and reverting them,
// never by a unit test. This file never imports, compiles, or runs a migration; it reads the
// TypeScript source as text (exactly as `route-table.spec.mjs` above scans controller sources) and
// asks whether that text names a write to one table. That is why the check lives here, in
// `tests/`, alongside the other repository-wide static-analysis gates, rather than under
// `apps/server/migrations/` or `apps/server/src/`.
//
// **Inverted to an allowlist (2026-09-08 review).** The first version of this check blocklisted a
// handful of mutating shapes — a blocklist of a SQL dialect and a query-builder API this file does
// not control fails open by construction, and the review proved it: 20 of 23 probed evasions
// passed, including the one `typeorm migration:generate` itself emits
// (`UPDATE "rejection_reasons" SET …`, a *quoted* identifier the old table-name pattern did not
// match at all) and the single most likely real-world reseed shape
// (`INSERT … ON CONFLICT (id) DO UPDATE SET label = …`). The rule now asks the opposite question:
// every call this file finds naming the catalogue — by table name (bare, quoted in `'`/`"`/`` ` ``,
// or schema-qualified) or by its TypeORM entity, `RejectionReasonEntity` — must be one of the
// handful of shapes an extend-only catalogue actually needs (`createTable`, `dropTable`, the
// structural DDL calls, and `insert`/`INSERT` without an `ON CONFLICT … DO UPDATE`). Anything else
// — `update`, `upsert`, `save`, `delete`, `softDelete`, `remove`, a raw `UPDATE`/`DELETE`/`TRUNCATE`,
// or an `INSERT … ON CONFLICT DO UPDATE` — fails closed rather than needing to be indiv
// enumerated.
//
// **What this still cannot see, by construction of static text analysis, noted rather than left
// implicit:** a table name built from a runtime variable or string concatenation
// (`` `UPDATE ${tableName} SET …` ``) names no literal this file can match; an entity imported under
// an alias (`import { RejectionReasonEntity as X }`) is invisible to the bare identifier check; and
// `const repo = manager.getRepository(RejectionReasonEntity); repo.update(...)` breaks the adjacent
// `getRepository(Entity).verb(...)` chain this file matches, because the entity and the verb are no
// longer textually adjacent — catching it would need data-flow analysis this file does not do. All
// three are extremely unlikely for a seeded, ten-row reference table with one seeding migration,
// and all three are recorded here rather than pretended not to exist.
const migrationFiles = () =>
  globSync('apps/server/migrations/*.ts')
    .filter((file) => !file.endsWith('.spec.ts'))
    .sort();

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/\/\/[^\n]*/gu, ' ');

const CATALOGUE_TABLE = 'rejection_reasons';
const CATALOGUE_ENTITY = 'RejectionReasonEntity';

// Strips every quoting character so `'rejection_reasons'`, `"rejection_reasons"`,
// `` `rejection_reasons` ``, `"public"."rejection_reasons"` and `public.rejection_reasons` all
// normalize to the same bare, dot-joined identifier text before matching.
const stripQuotes = (text) => text.replace(/["'`]/gu, '');

// True when `text` names the catalogue at all — by table name, tolerant of quoting and optional
// `public.` schema qualification in either direction, or by its TypeORM entity.
const namesCatalogue = (text) => {
  const normalized = stripQuotes(text);
  return (
    new RegExp(`\\b(?:public\\.)?${CATALOGUE_TABLE}\\b`, 'u').test(normalized) ||
    new RegExp(`\\b${CATALOGUE_TABLE}\\.public\\b`, 'u').test(normalized) ||
    new RegExp(`\\b${CATALOGUE_ENTITY}\\b`, 'u').test(text)
  );
};

// The text of one balanced call argument list, so a catalogue name mentioned in a *later*,
// unrelated statement is never mistaken for part of this call — the idiom
// `arrival-confirmation-write-boundary.spec.ts` already uses for the same reason.
const argumentsOf = (source, openParenIndex) => {
  let depth = 0;
  for (let index = openParenIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openParenIndex + 1, index);
      }
    }
  }
  return source.slice(openParenIndex);
};

// Every call this repository's migrations make through `queryRunner`, `queryRunner.manager`, a
// destructured `manager`, or the `getRepository(Entity).verb(...)` chain — the two idioms
// `arrival-confirmation-write-boundary.spec.ts`'s own `STRUCTURAL_WRITE` distinguishes for the same
// reason: `getRepository(Entity).method(...)` puts the entity *before* the verb, outside the verb
// call's own argument list, so a rule reading only that argument list would miss it entirely.
const CALL_PATTERN =
  /\b(?:queryRunner(?:\s*\.\s*manager)?|manager)\s*\.\s*([A-Za-z]+)\s*\(/gu;
const REPOSITORY_CALL_PATTERN =
  new RegExp(
    `getRepository\\s*\\(\\s*${CATALOGUE_ENTITY}\\s*\\)\\s*\\.\\s*([A-Za-z]+)\\s*\\(`,
    'gu',
  );

// Shapes an extend-only catalogue actually needs: creating and dropping its own table (the
// migration's own `up`/`down` pair), the structural DDL a schema change might still add, and
// extending it with new rows. Nothing here can reword or remove an existing row.
const ALLOWED_VERBS = new Set([
  'createTable',
  'dropTable',
  'createForeignKey',
  'dropForeignKey',
  'createIndex',
  'createIndices',
  'dropIndex',
  'createCheckConstraint',
  'createUniqueConstraint',
  'addColumn',
  'dropColumn',
  'createPrimaryKey',
  'insert',
]);

// A raw SQL statement's own leading keyword, which `query(...)` hides from `CALL_PATTERN`'s verb
// capture — `query` itself says nothing about whether the SQL inside is a SELECT, an INSERT or an
// UPDATE. An `INSERT … ON CONFLICT (id) DO UPDATE SET …` reads as an insert but rewords an existing
// row exactly as an UPDATE would — the single most likely real-world reseed shape the review named
// — so it is forbidden even though its leading keyword is INSERT.
const rawSqlVerdict = (sqlArguments) => {
  // Deliberately searched over the *whole* argument text, quotes and bind-parameter list
  // included, rather than an "inner literal" extracted between the outermost quote pair: a
  // migration's SQL routinely embeds single-quoted string literals of its own
  // (`INSERT … VALUES ('unfit_other', 'Other')`), and a naive `[quote]([^quote]*)[quote]` capture
  // stops at the *first* one of those, silently truncating everything after it — including an
  // `ON CONFLICT … DO UPDATE` clause several lines later. The keyword and the reseed clause are
  // both looked for directly in the untruncated text instead.
  const leadingKeyword = /[`'"]\s*([A-Za-z]+)/u.exec(sqlArguments)?.[1]?.toUpperCase();

  if (leadingKeyword === undefined) {
    return 'forbidden'; // unresolved SQL naming the catalogue — unknown, not "safe"
  }
  if (['UPDATE', 'DELETE', 'TRUNCATE', 'MERGE'].includes(leadingKeyword)) {
    return 'forbidden';
  }
  if (
    leadingKeyword === 'INSERT' &&
    /\bON\s+CONFLICT\b[\s\S]*?\bDO\s+UPDATE\b/iu.test(sqlArguments)
  ) {
    return 'forbidden';
  }
  return 'allowed';
};

// Every call in `source` naming the catalogue, each resolved to `'allowed'` or `'forbidden'` and
// carrying the verb that decided it — so a violation names both the offending statement's verb and
// the file it came from, not a bare boolean.
const catalogueCallsIn = (label, source) => {
  const code = stripComments(source);
  const calls = [];

  for (const pattern of [CALL_PATTERN, REPOSITORY_CALL_PATTERN]) {
    for (const match of code.matchAll(pattern)) {
      const verb = match[1];

      // `getRepository(...)` is an accessor, never a mutation on its own — without this guard
      // `manager.getRepository(RejectionReasonEntity).delete(...)` would be counted twice: once
      // (wrongly) as a `getRepository` "call naming the catalogue" through `CALL_PATTERN`, and
      // once (correctly) as a `delete` through `REPOSITORY_CALL_PATTERN`.
      if (verb === 'getRepository') {
        continue;
      }

      const openParenIndex = match.index + match[0].length - 1;
      const args =
        pattern === REPOSITORY_CALL_PATTERN
          ? match[0] // the entity itself names the catalogue; the call's own args need not
          : argumentsOf(code, openParenIndex);

      if (!namesCatalogue(args) && pattern !== REPOSITORY_CALL_PATTERN) {
        continue;
      }

      const verdict =
        verb === 'query'
          ? rawSqlVerdict(argumentsOf(code, openParenIndex))
          : ALLOWED_VERBS.has(verb)
            ? 'allowed'
            : 'forbidden';

      calls.push({ label, verb, verdict });
    }
  }

  return calls;
};

const forbiddenCallsIn = (files) =>
  files.flatMap((file) =>
    catalogueCallsIn(file, readFileSync(file, 'utf8')).filter(
      (call) => call.verdict === 'forbidden',
    ),
  ).map((call) => `${call.label}: forbidden .${call.verb}(...) against the catalogue`);

test('the migrations directory is non-empty, so this check has a real corpus', () => {
  assert.ok(
    migrationFiles().length > 0,
    'expected at least one migration file under apps/server/migrations/',
  );
});

// The corpus reaches the catalogue at all — otherwise a rename of `rejection_reasons`, or the
// catalogue migration being dropped, would leave this check vacuously green forever.
test('the corpus actually names the rejection_reasons catalogue', () => {
  const filesNamingCatalogue = migrationFiles().filter((file) =>
    namesCatalogue(stripComments(readFileSync(file, 'utf8'))),
  );

  assert.ok(
    filesNamingCatalogue.length > 0,
    'expected at least one migration to create or seed rejection_reasons',
  );
});

test('no migration updates or deletes a rejection_reasons row', () => {
  assert.deepEqual(forbiddenCallsIn(migrationFiles()), []);
});

// The teeth: each forbidden shape, proven against a fixture built only for this test — not the
// real migration files, which must stay clean — and each asserted by the returned label so a
// fixture cannot pass by matching the *wrong* rule.
test('detects a raw SQL UPDATE with a quoted, schema-qualified identifier (the migration:generate shape)', () => {
  const fixture = `
    await queryRunner.query(
      'UPDATE "public"."rejection_reasons" SET label = $1 WHERE id = $2',
      ['Damaged', 'damaged_in_transit'],
    );
  `;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verb, 'query');
  assert.equal(calls[0].verdict, 'forbidden');
});

test('detects an INSERT … ON CONFLICT DO UPDATE reseed, the likeliest real-world reword', () => {
  const fixture = `
    await queryRunner.query(\`
      INSERT INTO rejection_reasons (id, label) VALUES ('unfit_other', 'Other')
      ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label
    \`);
  `;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verdict, 'forbidden');
});

test('detects TRUNCATE, which deletes every row and names no column at all', () => {
  const fixture = `await queryRunner.query('TRUNCATE rejection_reasons');`;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verdict, 'forbidden');
});

test('detects DELETE FROM ONLY, schema-qualified', () => {
  const fixture = `await queryRunner.query('DELETE FROM ONLY public.rejection_reasons');`;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verdict, 'forbidden');
});

test('detects a builder .update(...) against the bare table name', () => {
  const fixture = `await queryRunner.manager.update('rejection_reasons', { id: 'unfit_other' }, { label: 'Other' });`;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verb, 'update');
  assert.equal(calls[0].verdict, 'forbidden');
});

test('detects a builder .delete(...) against the catalogue entity, chained through getRepository', () => {
  const fixture = `await manager.getRepository(RejectionReasonEntity).delete({ id: 'unfit_other' });`;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verb, 'delete');
  assert.equal(calls[0].verdict, 'forbidden');
});

test('detects a builder .softDelete(...) against the catalogue entity, chained through getRepository', () => {
  const fixture = `await manager.getRepository(RejectionReasonEntity).softDelete({ id: 'unfit_other' });`;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verb, 'softDelete');
  assert.equal(calls[0].verdict, 'forbidden');
});

test('detects .save(Entity, {...}) against the catalogue entity, save-with-id being an UPDATE', () => {
  const fixture = `await manager.save(RejectionReasonEntity, { id: 'unfit_other', label: 'Other' });`;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verb, 'save');
  assert.equal(calls[0].verdict, 'forbidden');
});

test('detects .remove(...) against the catalogue entity, chained through getRepository', () => {
  const fixture = `await manager.getRepository(RejectionReasonEntity).remove(reason);`;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verb, 'remove');
  assert.equal(calls[0].verdict, 'forbidden');
});

test('detects .upsert(...) against the bare table name', () => {
  const fixture = `await queryRunner.manager.upsert('rejection_reasons', [{ id: 'unfit_other', label: 'Other' }], ['id']);`;

  const calls = catalogueCallsIn('fixture', fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].verb, 'upsert');
  assert.equal(calls[0].verdict, 'forbidden');
});

// …and stays quiet on the shapes the real migration legitimately uses: creating the table, seeding
// it with `manager.insert`, and dropping the whole table in the `down()` that undoes its own
// `up()` — none of which is "updating or deleting a row" of an established catalogue.
test('does not flag creating the table, seeding it, or dropping it in its own down()', () => {
  const fixture = `
    await queryRunner.createTable(new Table({ name: 'rejection_reasons', columns: [] }));
    await queryRunner.manager.insert('rejection_reasons', [{ id: 'damaged_in_transit', label: 'Damaged in transit' }]);
    await queryRunner.query("INSERT INTO rejection_reasons (id, label) VALUES ('x', 'y')");
    await queryRunner.dropTable('rejection_reasons');
  `;

  assert.deepEqual(
    catalogueCallsIn('fixture', fixture).filter((call) => call.verdict === 'forbidden'),
    [],
  );
});

// A plain SELECT naming the catalogue — a foreign-key resolution read elsewhere in a migration,
// say — is not a mutation and must not be flagged either.
test('does not flag a raw SELECT naming the catalogue', () => {
  const fixture = `await queryRunner.query('SELECT id FROM rejection_reasons WHERE id = $1', [id]);`;

  assert.deepEqual(
    catalogueCallsIn('fixture', fixture).filter((call) => call.verdict === 'forbidden'),
    [],
  );
});
