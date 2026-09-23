import { Card } from '@heroui/react';
import type { ReactElement, ReactNode } from 'react';

type PanelCardProps = {
  /** The Panel's own visible `h2` (design-handoff.md § Accessibility: the
   * surface's own `h1` is visually hidden, so the heading order is
   * `h1 -> h2 x n`). */
  title: string;
  /** The Panel meta line, shown beside the title with no second line on
   * desktop (design-handoff.md § Component mapping). */
  meta: string;
  /** What the Panel draws inside `Card.Content`. A Panel whose rows cannot all
   * be seated at the 20px row-flex floor scrolls internally while the surface
   * does not (design-handoff.md § Responsive behavior, ruled at the tasks gate
   * 2026-09-21); that ceiling belongs to the list region the Panel renders
   * here, not to the Card, so this component declares nothing for it. */
  children: ReactNode;
};

/**
 * The frame every Panel is drawn in: HeroUI `Card` + `Card.Header` +
 * `Card.Content`. Padding, radius and both shadows are the Card contract and
 * are never restyled — this composes `Card` rather than building a detached
 * lookalike (design-handoff.md § Component mapping, ADR 0002 Consequences).
 *
 * `Card.Title` renders an `h3` by default; its `render` prop overrides the
 * rendered element without losing Card's own class names, props or ref
 * forwarding, which is how this gets the visible `h2` accessibility requires.
 */
export const PanelCard = ({
  title,
  meta,
  children,
}: PanelCardProps): ReactElement => (
  <Card>
    <Card.Header className="flex flex-row items-baseline justify-between gap-2">
      <Card.Title
        className="text-sm font-semibold text-foreground"
        render={(headingProps): ReactElement => (
          <h2 {...headingProps}>{title}</h2>
        )}
      >
        {title}
      </Card.Title>
      <Card.Description className="text-xs text-muted">{meta}</Card.Description>
    </Card.Header>
    <Card.Content>{children}</Card.Content>
  </Card>
);
