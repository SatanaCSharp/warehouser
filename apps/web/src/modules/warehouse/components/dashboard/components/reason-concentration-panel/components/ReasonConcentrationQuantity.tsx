import type { ReactElement } from 'react';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

/**
 * One printed quantity in a Reason Concentration row.
 *
 * A component rather than an expression in the cell, because React Aria caches
 * a row's element tree per record and `useLocaleFormat`'s formatter is
 * locale-dependent — a row that closed over it would keep the old locale's
 * grouping for the life of the surface
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision 2).
 *
 * It is this Panel's own rather than shared with the Coverage Gap Panel's
 * equivalent: each is ten lines, they are owned by different Panels, and
 * `docs/system/guides/writing-web-components.md` §9 prefers the duplication to
 * an abstraction neither Panel asked for.
 */

type ReasonConcentrationQuantityProps = {
  /** Tailwind classes for this column's alignment and emphasis. */
  className: string;
  value: number;
};

export const ReasonConcentrationQuantity = ({
  className,
  value,
}: ReasonConcentrationQuantityProps): ReactElement => {
  const { quantity } = useLocaleFormat();

  return <span className={className}>{quantity(value)}</span>;
};
