/**
 * Counts and captures the SQL the integration tier actually sends to PostgreSQL.
 *
 * This is how a spec asserts "in one query" — an N+1 guard. A repository that reads two tables as
 * two statements returns the same rows as one that joins them, so only the round-trip count tells
 * the two apart, and `creating-a-server-repository.md` forbids the first ("retrieving records
 * separately and joining or filtering them in application memory"). Several specs also need the
 * statement *text*, so an `EXPLAIN` test can re-plan the exact SQL the repository issued rather
 * than a hand-reconstructed approximation of it.
 *
 * The hook is TypeORM's own `Logger` interface, installed on the `DataSource` for the duration of
 * one call. `QueryRunner.query` calls `connection.logger.logQuery` unconditionally — before the
 * `BeforeQuery` broadcast and regardless of the `logging` option — so one `logQuery` is exactly one
 * round trip, including the transaction control statements the runner issues itself.
 *
 * It replaces `vi.spyOn(PostgresQueryRunner.prototype, 'query')`, which counted the same calls at
 * the same chokepoint but reached into `typeorm/driver/postgres/PostgresQueryRunner.js` to do it —
 * a deep subpath of a dependency, patched on its prototype. `logQuery` is the published interface
 * for this, and `access-current-user.repository.integration.spec.ts` already used it. The counts
 * are identical rather than merely comparable: the only other `logQuery` call site in the driver is
 * `QueryRunner.stream`, which nothing in this repository calls.
 *
 * Scope differs in one way worth knowing. The spy was global — it counted every `QueryRunner` in
 * the process — while this counts one `DataSource`. Every spec in this tier talks to exactly one,
 * the PGlite singleton `vitest.pglite.config.ts` aliases over `shared/database/data-source`, so
 * nothing observable changes.
 */
import dataSource from 'shared/database/data-source';
import type { Logger } from 'typeorm';

export interface RecordedStatement {
  readonly sql: string;
  readonly parameters: readonly unknown[];
}

/**
 * The statements a transaction opens and closes itself. Excluded by name rather than by subtracting
 * a fixed count, so an assertion does not drift the day the transaction service changes how it
 * opens one.
 */
export const isTransactionControl = (sql: string): boolean =>
  /^(?:START TRANSACTION|SET TRANSACTION|COMMIT|ROLLBACK|BEGIN)/u.test(sql);

class RecordingLogger implements Logger {
  readonly statements: RecordedStatement[] = [];

  logQuery(query: string, parameters?: unknown[]): void {
    this.statements.push({ sql: query, parameters: parameters ?? [] });
  }

  logQueryError(): void {}
  logQuerySlow(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}

/**
 * Bound to the tier's single `DataSource` rather than taking one: `vitest.pglite.config.ts` aliases
 * `shared/database/data-source` onto the PGlite one, and `alias-guard.setup.ts` fails the run before
 * any spec if that swap is not in effect — so this import and the spec's own are the same instance.
 */
export const recordQueries = async <T>(
  run: () => Promise<T>,
): Promise<{ result: T; statements: RecordedStatement[] }> => {
  const previous = dataSource.logger;
  const recorder = new RecordingLogger();
  dataSource.logger = recorder;

  try {
    const result = await run();
    return { result, statements: recorder.statements };
  } finally {
    // `finally` rather than a trailing restore: a spec that asserts on a rejection runs `run` to a
    // throw on purpose, and leaving the recorder installed would have it silently outlive the test
    // and count the next one's queries too.
    dataSource.logger = previous;
  }
};

/** Round trips including the transaction's own control statements. */
export const withQueryCount = async <T>(
  run: () => Promise<T>,
): Promise<{ result: T; queryCount: number }> => {
  const { result, statements } = await recordQueries(run);
  return { result, queryCount: statements.length };
};

/** Round trips excluding the transaction's own control statements. */
export const countRoundTrips = async <T>(
  run: () => Promise<T>,
): Promise<{ result: T; queryCount: number }> => {
  const { result, statements } = await recordQueries(run);
  return {
    result,
    queryCount: statements.filter(
      (statement) => !isTransactionControl(statement.sql),
    ).length,
  };
};

/** The SQL `run` issued, with the transaction control statements dropped. */
export const captureStatements = async <T>(
  run: () => Promise<T>,
): Promise<{ result: T; statements: string[] }> => {
  const { result, statements } = await recordQueries(run);
  return {
    result,
    statements: statements
      .map((statement) => statement.sql)
      .filter((sql) => !isTransactionControl(sql)),
  };
};
