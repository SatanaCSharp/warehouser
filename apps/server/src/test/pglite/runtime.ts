/**
 * The key `global-setup` publishes the migrated template dump under, and every
 * test file restores its database from.
 *
 * Vitest workers are separate processes, so the path travels through Vitest's
 * `provide`/`inject` channel rather than a shared variable.
 */
export const PGLITE_TEMPLATE_KEY = 'pgliteTemplateDump';

declare module 'vitest' {
  interface ProvidedContext {
    [PGLITE_TEMPLATE_KEY]: string;
  }
}
