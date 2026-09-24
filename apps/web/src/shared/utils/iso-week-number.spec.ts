import { isoWeekNumber } from 'shared/utils/iso-week-number';
import { describe, expect, it } from 'vitest';

/**
 * The ISO-8601 week number of the week a Monday begins.
 *
 * Both Dashboards print it: the Warehouse's Arrival Timing Panel at the mobile
 * width, and the Workspace's Order Flow Panel as its `W##` labels
 * (`design-handoff.md` § Responsive behavior). Until this spec arrived the rule
 * was implemented twice — once in `modules/warehouse/utils/` and once as a
 * private function inside `OrderFlowPanel.tsx` — and neither copy had a test of
 * its own; both were exercised only through the Panel that rendered them.
 *
 * Every case pins an absolute date. A week number is a pure function of the
 * date handed to it, so nothing here may read the clock: a spec that computed
 * its own expectation would agree with any implementation, including a wrong
 * one, and a spec seeded from "today" would pass or fail by the day it ran.
 */

describe('isoWeekNumber', () => {
  /**
   * `design-handoff.md` § Responsive behavior fixes this run by hand — "the
   * weeks become bare week numbers (`39`…`46`)" — so it is the design's own
   * worked example asserted against the implementation.
   */
  it('numbers the eight Mondays of the handoff’s worked example 39 to 46', () => {
    const mondays = [
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ];

    expect(mondays.map(isoWeekNumber)).toEqual([
      39, 40, 41, 42, 43, 44, 45, 46,
    ]);
  });

  /**
   * The half of ISO-8601 a naive "day of year / 7" gets wrong. Week 1 is the
   * week holding the year's first Thursday, so a week can belong to a year
   * neither of its own dates names, and a year can have 53 of them.
   */
  it.each([
    // The Monday of 2025-12-29 begins the week holding 2026-01-01, a Thursday,
    // so it is 2026's week 1 rather than a week of 2025.
    { monday: '2025-12-29', expected: 1 },
    { monday: '2026-01-05', expected: 2 },
    // 2026 is a 53-week ISO year: its last week starts inside December and
    // runs into 2027.
    { monday: '2026-12-28', expected: 53 },
    { monday: '2027-01-04', expected: 1 },
    // A second 53-week year, so the case above cannot pass by coincidence.
    { monday: '2020-12-28', expected: 53 },
    { monday: '2021-01-04', expected: 1 },
  ])('numbers $monday as week $expected', ({ monday, expected }) => {
    expect(isoWeekNumber(monday)).toBe(expected);
  });

  /**
   * The contract `shared/utils/date-format.ts#formatCalendarDate` already
   * keeps: a plain date names a day, and a value that is not one is a
   * programming error rather than something to render.
   */
  it('throws on a value that is not a calendar date', () => {
    expect(() => isoWeekNumber('not-a-date')).toThrow();
  });

  /**
   * A plain date names a day, not an instant, so it must never be reinterpreted
   * through the viewer's zone — the reason `shared/utils/date-format.ts` gives
   * for anchoring every calendar-date read in UTC. Asserted by running the same
   * date either side of the international date line: a local-zone
   * implementation returns different weeks for the two, this one does not.
   */
  it('reads the date in UTC, not the viewer’s zone', () => {
    const original = process.env.TZ;

    try {
      process.env.TZ = 'Pacific/Kiritimati';
      const ahead = isoWeekNumber('2026-09-21');

      process.env.TZ = 'Etc/GMT+12';
      const behind = isoWeekNumber('2026-09-21');

      expect(ahead).toBe(39);
      expect(behind).toBe(39);
    } finally {
      process.env.TZ = original;
    }
  });
});
