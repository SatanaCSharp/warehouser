import type { ReactElement } from 'react';
import { useLocaleFormat } from 'shared/hooks/projections/useLocaleFormat';

/**
 * A Warehouse's total outstanding quantity.
 *
 * A component for the same reason every other figure on this Panel is one:
 * `useLocaleFormat` is locale-dependent and a row's element tree is cached per
 * record, so an expression closing over the formatter would freeze it
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`
 * §Decision 2).
 */

type DemandPressureOutstandingProps = {
  value: number;
};

export const DemandPressureOutstanding = ({
  value,
}: DemandPressureOutstandingProps): ReactElement => {
  const { quantity } = useLocaleFormat();

  return (
    <span className="block text-right font-semibold tabular-nums text-foreground">
      {quantity(value)}
    </span>
  );
};
