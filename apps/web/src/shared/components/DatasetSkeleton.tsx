import { Skeleton } from '@heroui/react';
import type { ReactElement } from 'react';

export type DatasetSkeletonProps = {
  /**
   * What is being loaded, announced to assistive technology — `Loading demand`
   * (design-handoff.md §States, frame `hWFRW` tile `EZn9c`). It names the
   * dataset, not the application, so a member hears which destination is
   * arriving.
   */
  label: string;
  /** How many placeholder rows to draw. Defaults to a table's worth. */
  rows?: number;
  /**
   * The widths of one row's placeholder bars, as CSS lengths — the shape the
   * destination's own content has. A table passes its column widths
   * (`['40%', '12%', '16%']`); a card list passes a wide bar and a couple of
   * narrow ones. Every row is drawn to the same shape, which is what makes the
   * skeleton read as the content rather than as a generic spinner.
   */
  columns?: readonly string[];
};

const DEFAULT_ROWS = 5;
const DEFAULT_COLUMNS: readonly string[] = ['40%', '18%', '18%'];

/**
 * The loading state a destination paints while its route awaits its data.
 *
 * Route-level readiness is the route's to own (frontend-architecture.md §Page),
 * so this is composed by a route's `pendingComponent` and shaped to that
 * destination's content — never declared as a readiness branch inside a
 * component whose data the route already awaited.
 *
 * It replaces the centred spinner of `RoutePendingState` for a destination that
 * has a shape worth drawing; `RoutePendingState` stays the application-level
 * waiting affordance for one that does not.
 */
type PlaceholderBar = { key: string; width: string };
type PlaceholderRow = { key: string; bars: readonly PlaceholderBar[] };

/**
 * The grid to draw, resolved to keyed descriptors before the return. The
 * placeholders carry no identity of their own — nothing reorders, nothing is
 * inserted, and none of them holds state — so their key is their position, and
 * naming it here keeps the JSX a plain `map` over data.
 */
const placeholderRows = (
  rows: number,
  columns: readonly string[],
): readonly PlaceholderRow[] =>
  Array.from({ length: rows }, (_row, row) => ({
    key: `row-${row}`,
    bars: columns.map((width, column) => ({ key: `bar-${column}`, width })),
  }));

export const DatasetSkeleton = ({
  label,
  rows = DEFAULT_ROWS,
  columns = DEFAULT_COLUMNS,
}: DatasetSkeletonProps): ReactElement => (
  <div
    role="status"
    aria-busy
    aria-label={label}
    className="divide-y divide-border rounded-lg border border-border"
  >
    {placeholderRows(rows, columns).map((row) => (
      <div key={row.key} className="flex items-center gap-4 px-4 py-4">
        {row.bars.map((bar) => (
          <Skeleton
            key={bar.key}
            className="h-4 rounded-md"
            style={{ width: bar.width }}
          />
        ))}
      </div>
    ))}
  </div>
);
