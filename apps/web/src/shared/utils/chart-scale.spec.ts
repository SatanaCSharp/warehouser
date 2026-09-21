import { bucketOffset, linearScale } from 'shared/utils/chart-scale';
import { describe, expect, it } from 'vitest';

// ADR 0002 — no charting dependency: every mark is a positioned box computed by
// these two pure functions, so they are unit-tested directly rather than
// through a rendered chart (design-handoff.md § Tokens / Type and mark specs).
describe('linearScale', () => {
  it('maps a value proportionally onto the track width', () => {
    expect(linearScale(1250, 2500, 150)).toBe(75);
    expect(linearScale(0, 2500, 150)).toBe(0);
    expect(linearScale(2500, 2500, 150)).toBe(150);
  });

  it('never returns more than the track width for a value beyond the domain max', () => {
    expect(linearScale(5000, 2500, 150)).toBe(150);
  });

  it('never returns a negative offset for a negative value', () => {
    expect(linearScale(-10, 2500, 150)).toBe(0);
  });

  // The degenerate zero-range case: a Panel with nothing to plot has a domain
  // max of 0. `value / 0` is not a number, and a chart drawn from NaN/Infinity
  // is a defect no visual review would catch, because nothing paints.
  it('returns a finite zero rather than NaN or Infinity when the domain max is zero', () => {
    expect(linearScale(0, 0, 150)).toBe(0);
    expect(Number.isFinite(linearScale(0, 0, 150))).toBe(true);
  });
});

describe('bucketOffset', () => {
  it('sums the widths of every bucket before the given index, plus one gap per boundary crossed', () => {
    // Arrival Timing: one 56px Overdue bucket, then eight 44.75px weeks, gap 2.
    const widths = [56, 44.75, 44.75];
    expect(bucketOffset(0, widths, 2)).toBe(0);
    expect(bucketOffset(1, widths, 2)).toBe(58); // 56 + 2
    expect(bucketOffset(2, widths, 2)).toBe(104.75); // 56 + 2 + 44.75 + 2
  });

  it('offsets the first bucket at zero regardless of gap', () => {
    expect(bucketOffset(0, [56, 44.75], 8)).toBe(0);
  });

  // The degenerate zero-range case: no buckets at all (an empty Panel) and a
  // zero-width bucket set must not throw or divide by anything.
  it('returns zero for an empty bucket set', () => {
    expect(bucketOffset(0, [], 2)).toBe(0);
  });

  it('returns zero for every index when every bucket is zero-width', () => {
    expect(bucketOffset(0, [0, 0, 0], 4)).toBe(0);
    expect(bucketOffset(2, [0, 0, 0], 4)).toBe(8); // still two gaps crossed
    expect(Number.isFinite(bucketOffset(2, [0, 0, 0], 4))).toBe(true);
  });
});
