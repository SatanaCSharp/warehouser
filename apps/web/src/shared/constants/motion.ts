/**
 * What a collection row carries so it fades and rises into place when it joins
 * a list — a Purchase Draft line just added, a Warehouse just created, a person
 * just granted access.
 *
 * It is CSS rather than a hook because a row may not call one. React Aria
 * caches a row's element tree per record, so a renderer inside a collection
 * closes over no live state and calls no hook at all
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`). A class
 * the row simply wears is the only mechanism available to every list shape at
 * once.
 *
 * `starting:` is the `@starting-style` rule: the browser paints the row once at
 * the from-state and transitions to its settled style, which is what makes the
 * entrance work without React remounting anything or a library holding the row
 * for an extra frame.
 *
 * **There is deliberately no matching exit.** An exit animation needs the
 * removed row to stay in the DOM until it finishes, and every list here drops
 * the record from the collection the moment the mutation commits. Keeping a
 * departed row mounted would mean holding removed records in component state
 * beside the query cache — a second source of truth for what the collection
 * contains, which is the thing `frontend-architecture.md` refuses. Rows
 * therefore arrive with motion and leave immediately.
 *
 * The 200ms/ease-out pair is the shell's one duration and curve, matching
 * `shared/hooks/effects/useContentTransition.ts` and the sidebar's own
 * transitions. `motion-reduce:` drops the transition entirely, which also
 * disables the `@starting-style` rule — a style only ever observed through the
 * transition it starts.
 */
export const ROW_ENTER =
  'transition-[opacity,translate] duration-200 ease-out starting:opacity-0 starting:translate-y-1 motion-reduce:transition-none';
