import { Button } from '@heroui/react';
import type { DemandLine } from '@warehouser/contracts/customer-orders';
import { useDemandDisclosureLabel } from 'modules/customer-order/hooks/projections/useDemandDisclosureLabel';
import type { ReactElement } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'shared/icons';

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
 * **It states its count as visible text**, beside the chevron rather than only
 * behind an `aria-label`: `G6jhw` draws the desktop control as
 * `5 customer orders` collapsed and `hide the 2 customer orders` expanded, and
 * `SjdPo` draws the mobile card's the same way. An icon-only chevron told a
 * sighted member nothing about how many orders a row expands into, and made the
 * two surfaces disagree about the same control.
 *
 * `slot="chevron"` is what hands the press to React Aria's table, which owns
 * the expansion and the `aria-expanded` that reports it; this supplies only the
 * name and the direction.
 *
 * The `aria-label` is **the same string that is drawn**, not a second wording
 * of it. React Aria labels the chevron by the row it belongs to and falls back
 * to its own `Expand`/`Collapse` for the control's own half of that name, which
 * would drop the count from what is announced and leave the visible label
 * absent from the accessible name (WCAG 2.5.3). Passing the rendered sentence
 * keeps the two identical by construction: they are one value.
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
  const label = disclosureLabel(line, isExpanded);

  return (
    <Button size="sm" slot="chevron" variant="ghost" aria-label={label}>
      {disclosureIcons[isExpanded ? 'expanded' : 'collapsed']}
      {label}
    </Button>
  );
};
