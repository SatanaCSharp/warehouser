/**
 * The Demand Pressure Panel's three urgency bands.
 *
 * Ids and token names only, with no copy: the Panel builds its legend labels
 * from the same ids, and keeping the labels out of here is what lets
 * `DemandPressureBar` read no translation and therefore hold nothing a cached
 * row could freeze
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision 2).
 *
 * A file that declares no hook belongs in a `utils/` directory
 * (`docs/system/guides/placing-web-hooks.md` §3), and a component file exports
 * components and nothing else.
 */

/** Ordinal steps 1–3, dark to light: Overdue, Due soon, Later. */
export const DEMAND_PRESSURE_SERIES = [
  { id: 'overdue', colorVar: '--chart-ramp-3a' },
  { id: 'dueSoon', colorVar: '--chart-ramp-3b' },
  { id: 'later', colorVar: '--chart-ramp-3c' },
] as const;
