import type { ReactElement } from 'react';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

/**
 * One printed quantity in a Coverage Gap row.
 *
 * It exists as a component rather than as an expression inside the cell
 * because of the rule
 * `docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md` §Decision 2
 * states: React Aria builds a row's element tree before the DOM and **caches it
 * per record**, so anything a row renderer closes over stays whatever it was at
 * first build. `useLocaleFormat` is exactly such a value — its `quantity`
 * formatter is locale-dependent, so a row that closed over it would keep the
 * old locale's grouping for the life of the surface after a language change.
 * A component inside a cell is rendered into the real tree and subscribes
 * itself, so it re-renders when the locale does.
 */

type CoverageGapQuantityProps = {
  /** Tailwind classes for this column's alignment and emphasis. */
  className: string;
  value: number;
};

export const CoverageGapQuantity = ({
  className,
  value,
}: CoverageGapQuantityProps): ReactElement => {
  const { quantity } = useLocaleFormat();

  return <span className={className}>{quantity(value)}</span>;
};
