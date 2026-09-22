import clamp from 'lodash/clamp';

/**
 * The one scale every Panel needs: a value mapped proportionally onto a pixel
 * track, from zero to `domainMax`. ADR 0002 ("Draw the Panels from layout
 * primitives … with no charting dependency") states the only computation the
 * design's marks require is `value / max * trackWidth`, so this is a pure
 * function rather than a charting library's continuous-domain scale.
 *
 * `domainMax` is a Panel's own rounded maximum (design-handoff.md § Type and
 * mark specs), so a value beyond it is clamped rather than overflowing the
 * track, and a negative value is clamped to zero rather than drawing a
 * negative-width mark. `domainMax` of zero is the degenerate case a Panel
 * with nothing to plot produces — `value / 0` is not a number, so it is
 * special-cased to a finite zero instead of `NaN`/`Infinity`.
 */
export const linearScale = (
  value: number,
  domainMax: number,
  trackWidth: number,
): number => {
  if (domainMax <= 0) {
    return 0;
  }

  return (clamp(value, 0, domainMax) / domainMax) * trackWidth;
};
