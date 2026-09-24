/**
 * One Panel's standing, as its own `hooks/queries/` hook reports it.
 *
 * The three states are kept apart deliberately. Before the `dashboards`
 * conformance remediation a `body` of `undefined` meant "not admitted", "the
 * read failed" and "the cache entry was collected" alike, so a failed read was
 * presented as an authorization refusal — a false statement about the member's
 * authority (`docs/system/frontend-architecture.md` §Page).
 *
 * A type declaration and no hook, so it belongs in a `utils/`-shaped file
 * rather than being exported from one of the hooks that returns it
 * (`docs/system/guides/placing-web-hooks.md` §1 keeps a file to one hook and
 * the types it carries; this one is carried by four).
 */
export type PanelReading<TBody> = {
  body: TBody | undefined;
  failed: boolean;
  permitted: boolean;
};
