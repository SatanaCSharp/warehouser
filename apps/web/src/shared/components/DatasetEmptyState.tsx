import { EmptyState } from '@heroui/react';

import { Conditional } from 'shared/components/Conditional';

import type { ReactElement, ReactNode } from 'react';

export type DatasetEmptyStateProps = {
  /**
   * Why the collection is empty, in one sentence of the page's own vocabulary
   * — `No customer is waiting for anything yet` (frame `hWFRW` tiles `mEZpI`,
   * `Sv9md`). Not "No results".
   */
  heading: string;
  /** What the reader would have to do for something to appear here. */
  description: string;
  /**
   * The icon of the thing that is missing, drawn above the heading.
   */
  icon?: ReactNode;
  /**
   * The one action that fills the collection, already gated by its own
   * Permission. Omitted when the reader cannot fill it — an empty state never
   * offers a control the actor may not use, and never renders a disabled one
   * (`docs/system/adr/19-08-2026-declarative-permission-gates.md`).
   */
  action?: ReactNode;
};

/**
 * The empty state a destination paints when its collection holds nothing.
 *
 * A heading, an explanation and a call to action, rather than the single
 * four-word sentence `DatasetCard` renders inside a card body — the approved
 * frames name why the list is empty and offer the one action that fills it
 * (design-handoff.md §States). `DatasetCard` keeps its own message for a
 * dataset presented as a card with a title above it; this is the full-surface
 * state a table or a card list resolves to.
 *
 * It announces itself with `role="status"` for the same reason `DatasetCard`'s
 * message does: reaching an empty collection is a resolved outcome, not an
 * error.
 */
export const DatasetEmptyState = ({
  heading,
  description,
  icon,
  action,
}: DatasetEmptyStateProps): ReactElement => (
  <EmptyState
    role="status"
    className="flex flex-col items-start gap-3 rounded-lg bg-surface-secondary px-6 py-8 text-left"
  >
    <Conditional when={icon}>
      <span className="text-muted">{icon}</span>
    </Conditional>
    <h3 className="text-base font-semibold text-foreground">{heading}</h3>
    <p className="max-w-prose text-muted">{description}</p>
    <Conditional when={action}>{action}</Conditional>
  </EmptyState>
);
