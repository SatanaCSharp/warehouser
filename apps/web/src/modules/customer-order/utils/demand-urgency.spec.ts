import { describe, expect, it } from 'vitest';

import { resolveDemandUrgency } from 'modules/customer-order/utils/demand-urgency';

// The urgency chip on `EARLIEST NEEDED BY` (design frame `G6jhw`: `in 8 days`,
// `in 17 days`, and the danger `overdue by 4 days`). What this suite pins is the
// three boundaries the chip is wrong at if the arithmetic is off by one — the
// needed-by date being today, being tomorrow, and having passed by exactly one
// day — plus the month and year rollovers a naive subtraction gets wrong.
// Colocated with the helper it covers (`placing-web-tests.md` §1).

describe('resolveDemandUrgency', () => {
  it('reports the needed-by date itself as due today rather than as overdue or upcoming', () => {
    expect(resolveDemandUrgency('2026-08-31', '2026-08-31')).toEqual({
      state: 'today',
      days: 0,
    });
  });

  it('reports tomorrow as one day upcoming', () => {
    expect(resolveDemandUrgency('2026-09-01', '2026-08-31')).toEqual({
      state: 'upcoming',
      days: 1,
    });
  });

  it('reports yesterday as overdue by exactly one day', () => {
    expect(resolveDemandUrgency('2026-08-30', '2026-08-31')).toEqual({
      state: 'overdue',
      days: 1,
    });
  });

  it('counts the whole days the frame draws (`in 8 days`, `overdue by 4 days`)', () => {
    expect(resolveDemandUrgency('2026-09-02', '2026-08-25')).toEqual({
      state: 'upcoming',
      days: 8,
    });
    expect(resolveDemandUrgency('2026-08-21', '2026-08-25')).toEqual({
      state: 'overdue',
      days: 4,
    });
  });

  it('counts across a month and a year boundary', () => {
    expect(resolveDemandUrgency('2026-09-01', '2026-08-30')).toEqual({
      state: 'upcoming',
      days: 2,
    });
    expect(resolveDemandUrgency('2027-01-01', '2026-12-30')).toEqual({
      state: 'upcoming',
      days: 2,
    });
  });

  // A plain calendar date names a day, not an instant. Pushing one through
  // `new Date('2026-08-25')` reads it as midnight UTC and reports it in the
  // viewer's zone, which shifts the day west of Greenwich — the same trap
  // `shared/utils/date-format.ts` records. Anchoring both dates in one fixed
  // zone is what keeps the answer identical everywhere.
  it('gives the same answer in a zone behind UTC as in one ahead of it', () => {
    const original = process.env.TZ;
    const answers = ['Pacific/Kiritimati', 'Pacific/Midway'].map((zone) => {
      process.env.TZ = zone;
      return resolveDemandUrgency('2026-08-31', '2026-08-30');
    });
    process.env.TZ = original;

    expect(answers[0]).toEqual({ state: 'upcoming', days: 1 });
    expect(answers[1]).toEqual(answers[0]);
  });
});
