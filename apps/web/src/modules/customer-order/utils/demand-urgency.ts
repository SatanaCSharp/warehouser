import { getLocalTimeZone, parseDate, today } from '@internationalized/date';

/** How a Demand Line's earliest needed-by date stands against today. */
export type DemandUrgencyState = 'overdue' | 'today' | 'upcoming';

export type DemandUrgency = {
  state: DemandUrgencyState;
  /** Whole days between the two dates, always as a magnitude. */
  days: number;
};

const MS_PER_DAY = 86_400_000;

/**
 * Which state wins, most significant first, as a table rather than the order of
 * `else if` lines (`writing-web-components.md` §6). `upcoming` is the fallback
 * because it is the only state a positive difference can be in.
 */
const urgencyStates: readonly {
  state: DemandUrgencyState;
  holds: (days: number) => boolean;
}[] = [
  { state: 'overdue', holds: (days) => days < 0 },
  { state: 'today', holds: (days) => days === 0 },
];

/**
 * The calendar day the viewer is currently in, as the `YYYY-MM-DD` string every
 * date-valued contract field carries. It is taken from the viewer's own zone,
 * because "overdue" is a statement about the member's day rather than about UTC.
 */
export const currentCalendarDate = (): string =>
  today(getLocalTimeZone()).toString();

/**
 * How urgent one needed-by date is (design frame `G6jhw`: the neutral
 * `in 8 days` chip, and the danger `overdue by 4 days` once the date has
 * passed). The design's own words make this the most decision-bearing signal on
 * the Demand destination, and nothing else on the row states it.
 *
 * Both dates are plain calendar dates, so the difference is taken between the
 * two days anchored in **one** fixed zone — never through
 * `new Date('2026-08-25')`, which reads a date-only string as midnight UTC and
 * reports it in the viewer's zone, shifting the day west of Greenwich
 * (`shared/utils/date-format.ts` records the same trap).
 *
 * The boundaries are exact: the needed-by date itself is `today`, the next day
 * is `upcoming` with one day, and the previous day is `overdue` by one day.
 */
export const resolveDemandUrgency = (
  neededBy: string,
  currentDate: string,
): DemandUrgency => {
  const difference = Math.round(
    (parseDate(neededBy).toDate('UTC').getTime() -
      parseDate(currentDate).toDate('UTC').getTime()) /
      MS_PER_DAY,
  );

  return {
    state:
      urgencyStates.find(({ holds }) => holds(difference))?.state ?? 'upcoming',
    days: Math.abs(difference),
  };
};
