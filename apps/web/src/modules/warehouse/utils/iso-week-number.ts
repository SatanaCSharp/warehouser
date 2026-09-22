import { parseDate } from '@internationalized/date';

/**
 * T18 — the bare week number `ArrivalTimingPanel` prints at the mobile width
 * (`design-handoff.md` § Responsive behavior: "the weeks become bare week
 * numbers (`39`…`46`) so no two labels touch"). A pure helper, so it belongs
 * beside `ArrivalTimingPanel` in this module's own `utils/` rather than in
 * `shared/utils/` — it has one consumer today
 * (`docs/system/guides/placing-web-hooks.md` §3).
 */

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** Every `weekStart` this function reads is already a Monday, so stepping
 * three days lands on that week's Thursday with no day-of-week correction. */
const THURSDAY_OFFSET_FROM_MONDAY = 3;

/**
 * The ISO-8601 week number of the Monday `mondayIsoDate` begins — week 1 is
 * the week carrying the year's first Thursday. `design-handoff.md` §
 * Responsive behavior's own worked example — the eight Mondays beginning
 * `2026-09-21` read `39`…`46` — is this function's own fixture
 * (`ArrivalTimingPanel.spec.tsx`).
 *
 * Anchored and computed entirely in UTC, for the reason
 * `shared/utils/date-format.ts` states for every other calendar-date read in
 * this application: a plain date names a day, not an instant, so it must
 * never be reinterpreted through the viewer's local zone.
 *
 * Throws on a value that is not a calendar date, the same contract
 * `shared/utils/date-format.ts#formatCalendarDate` keeps.
 */
export const isoWeekNumber = (mondayIsoDate: string): string => {
  const monday = parseDate(mondayIsoDate).toDate('UTC');
  const thursday = new Date(
    monday.getTime() + THURSDAY_OFFSET_FROM_MONDAY * MILLISECONDS_PER_DAY,
  );

  const firstOfYear = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const firstOfYearDayIndex = (new Date(firstOfYear).getUTCDay() + 6) % 7; // Monday = 0
  const firstThursdayOffset =
    (THURSDAY_OFFSET_FROM_MONDAY - firstOfYearDayIndex + 7) % 7;
  const firstThursday =
    firstOfYear + firstThursdayOffset * MILLISECONDS_PER_DAY;

  const weekNumber =
    1 +
    Math.round(
      (thursday.getTime() - firstThursday) / (7 * MILLISECONDS_PER_DAY),
    );

  return String(weekNumber);
};
