/**
 * Where `global-setup` publishes the migrated template dump that every test
 * file restores its database from. Jest workers are separate processes, so the
 * path travels through the environment.
 */
export const PGLITE_TEMPLATE_ENV = 'PGLITE_TEMPLATE_DUMP';
