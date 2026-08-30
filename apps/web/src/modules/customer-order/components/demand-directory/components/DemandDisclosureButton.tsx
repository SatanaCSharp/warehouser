import { Button } from '@heroui/react';

import { useDemandDisclosureLabel } from 'modules/customer-order/hooks/projections/useDemandDisclosureLabel';
import { ChevronDownIcon, ChevronUpIcon } from 'shared/icons';

import type { DemandLine } from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';

export type DemandDisclosureButtonProps = {
  isExpanded: boolean;
  line: DemandLine;
};

/**
 * Which way a Demand Line's chevron points. A total lookup rather than a
 * ternary between two elements (`writing-web-components.md` §6); the icons
 * take no props, so the direction cannot be a class on one of them.
 */
const disclosureIcons: Record<'collapsed' | 'expanded', ReactElement> = {
  collapsed: <ChevronDownIcon />,
  expanded: <ChevronUpIcon />,
};

/**
 * The control that expands one Demand Line into its Unfulfilled Customer
 * Orders (AC-04, AC-20).
 *
 * `slot="chevron"` is what hands the press to React Aria's table, which owns
 * the expansion and the `aria-expanded` that reports it; this supplies only the
 * name and the direction.
 *
 * It is a component rather than markup inlined in the table's row renderer
 * because its name is translated: a React Aria collection caches a row's
 * element tree per record, so a label resolved above it would keep the language
 * that was active when the row was first built
 * (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DemandDisclosureButton = ({
  isExpanded,
  line,
}: DemandDisclosureButtonProps): ReactElement => {
  const disclosureLabel = useDemandDisclosureLabel();

  return (
    <Button
      isIconOnly
      size="sm"
      slot="chevron"
      variant="ghost"
      aria-label={disclosureLabel(line, isExpanded)}
    >
      {disclosureIcons[isExpanded ? 'expanded' : 'collapsed']}
    </Button>
  );
};
