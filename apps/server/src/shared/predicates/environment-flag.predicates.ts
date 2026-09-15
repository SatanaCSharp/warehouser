import { isProd } from '@warehouser/utils/predicates';

/** How the server reads a boolean out of its environment.
 *
 * Every environment value arrives as a string, so "is this on?" is a comparison against a literal —
 * written inline it is the same comparison in the logger module, the HTTP platform config and
 * whatever reads a flag next, each free to disagree about whether `'TRUE'` or `'1'` counts. It does
 * not: only the exact string `'true'` enables a flag, and a value that is neither `'true'` nor
 * `'false'` is a misconfiguration rather than a default. */

/** Whether the declaration enables the flag. Nothing but the exact string `'true'` does. */
export const isDeclaredTrue = (value: string | undefined): boolean =>
  value === 'true';

/** Whether the declaration states a boolean at all.
 *
 * A narrowing predicate, because a caller that has asked this may then keep the declaration as the
 * two-valued thing it proved it to be, rather than re-deriving it. */
export const isBooleanDeclaration = (
  value: string | undefined,
): value is 'false' | 'true' => value === 'true' || value === 'false';

/** Whether the process is running in production.
 *
 * Composes `isProd` from `@warehouser/utils/predicates` and accepts the absent case, which
 * `NODE_ENV` genuinely has — an unset `NODE_ENV` is not production. */
export const isProductionEnvironment = (nodeEnv: string | undefined): boolean =>
  isProd(nodeEnv ?? '');
