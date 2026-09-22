import { parseDate } from '@internationalized/date';

/**
 * The ISO-8601 week number of the week a Monday begins.
 *
 * Both Dashboards print it — the Warehouse's Arrival Timing Panel as the bare
 * week numbers it substitutes for dates at the mobile width, and the
 * Workspace's Order Flow Panel as its `W##` labels
 * (`design-handoff.md` § Responsive behavior). Two modules need it and no
 * single domain entity owns a calendar rule, which is what puts it here rather
 * than in either module's own `utils/`
 * (`docs/system/frontend-architecture.md` §'Source structure';
 * `docs/system/guides/placing-web-hooks.md` §3).
 *
 * It was implemented twice before this — once here, once privately inside
 * `OrderFlowPanel.tsx` — with two different input contracts and two different
 * return types, and neither copy had a spec of its own.
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
export const isoWeekNumber = (mondayIsoDate: string): number => {
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

  return (
    1 +
    Math.round(
      (thursday.getTime() - firstThursday) / (7 * MILLISECONDS_PER_DAY),
    )
  );
};
