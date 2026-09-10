import type { ReactElement } from 'react';
import { TriangleAlertIcon } from 'shared/icons';

export type DriftSignalProps = {
  className?: string;
  label: string;
};

/**
 * The Drift Signal presentation (AC-16, AC-16a; design-handoff.md `l5QF7B`
 * "Drift Row", `F0SpRx` node `G5PCcB`, `BSmrU` per-link drift chip). Icon
 * **plus** text, never colour alone — `--warning` only tints an icon whose
 * shape (a triangle with an alert mark) and adjacent label both carry the
 * meaning on their own, so the signal survives a colour-blind or greyscale
 * rendering. Every consumer — the list card, the aggregate alert and the
 * link row's chip — renders this one component rather than repainting a
 * warning chip of its own, so "icon plus text" cannot drift out of one of
 * them.
 */
export const DriftSignal = ({
  className,
  label,
}: DriftSignalProps): ReactElement => (
  <span
    className={`inline-flex items-center gap-1.5 text-warning ${className ?? ''}`.trim()}
    role="status"
  >
    <TriangleAlertIcon />
    <span>{label}</span>
  </span>
);
