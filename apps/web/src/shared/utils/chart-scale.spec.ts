import { linearScale } from 'shared/utils/chart-scale';
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
