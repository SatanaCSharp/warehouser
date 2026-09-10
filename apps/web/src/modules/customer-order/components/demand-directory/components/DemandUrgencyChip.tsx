import { Chip } from '@heroui/react';
import type { DemandUrgencyState } from 'modules/customer-order/utils/demand-urgency';
import {
  currentCalendarDate,
  resolveDemandUrgency,
} from 'modules/customer-order/utils/demand-urgency';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type DemandUrgencyChipProps = {
  /** The Demand Line's earliest needed-by date, as `YYYY-MM-DD`. */
  neededBy: string;
};

/** Overdue demand is danger; everything still ahead is neutral. */
const urgencyColors: Record<DemandUrgencyState, 'danger' | 'default'> = {
  overdue: 'danger',
  today: 'default',
  upcoming: 'default',
};

const urgencyLabels: Record<DemandUrgencyState, string> = {
  overdue: 'demand.urgency.overdue',
  today: 'demand.urgency.today',
  upcoming: 'demand.urgency.upcoming',
};

/**
 * `today` carries no count because "needed today" states no number; the other
 * two do, so the interpolation is a total lookup rather than a branch
 * (`writing-web-components.md` §6).
 */
const urgencyOptions: Record<
  DemandUrgencyState,
  (days: number) => { count?: number }
> = {
  overdue: (days) => ({ count: days }),
  today: () => ({}),
  upcoming: (days) => ({ count: days }),
};

/**
 * How long the earliest customer of a Demand Line still has to wait, or how
 * long they have been waiting past the date they asked for — the counted chip
 * below the date (design frame `G6jhw`: `in 8 days`, danger `overdue by 4
 * days`).
 *
 * Nothing here is communicated by colour alone (design-handoff.md
 * §Accessibility): the chip says `overdue by 4 days` in words.
 *
 * It is a component rather than markup inlined in the table's row renderer
 * because it translates and reads the current day: a React Aria collection
 * caches a row's element tree per record, so anything resolved above it would
 * keep the language — and the day — that was active when the row was first
 * built (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
 */
export const DemandUrgencyChip = ({
  neededBy,
}: DemandUrgencyChipProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const { days, state } = resolveDemandUrgency(neededBy, currentCalendarDate());

  return (
    <Chip color={urgencyColors[state]} size="sm" variant="soft">
      {t(urgencyLabels[state], urgencyOptions[state](days))}
    </Chip>
  );
};
