/**
 * One Workspace Panel's standing, as its own `hooks/queries/` hook reports it.
 *
 * Kept apart from "the body is `undefined`" for the reason the Warehouse
 * surface's equivalent is: before the `dashboards` conformance remediation a
 * missing body meant "not admitted", "the read failed" and "the cache entry
 * was collected" alike, so a failed read presented the authorization denial
 * (`docs/system/frontend-architecture.md` §Page).
 *
 * A type and no hook, so it is filed in `utils/` rather than in `hooks/`
 * (`docs/system/guides/placing-web-hooks.md` §3); four hooks return it, so it
 * cannot live in any one of them.
 */
export type WorkspacePanelReading<TBody> = {
  body: TBody | undefined;
  failed: boolean;
  permitted: boolean;
};
