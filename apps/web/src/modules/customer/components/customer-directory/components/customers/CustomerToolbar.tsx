import { Toolbar } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { CustomerSearchField } from 'modules/customer/components/customer-directory/components/customers/CustomerSearchField';
import { RecordCustomerAction } from 'modules/customer/components/customer-directory/components/customers/RecordCustomerAction';

import type { ReactElement } from 'react';

export type CustomerToolbarProps = {
  query: string;
  onQueryChange: (query: string) => void;
};

/**
 * The Customers destination's toolbar row (frame `KRDln`): the 320px search at
 * the start and the destination's one primary action at the end.
 *
 * **It spans the destination, not the list column.** The frame puts this row
 * above the list-and-detail split at the full content width, and it has to be
 * rendered there: inside the 340px column the 320px field leaves 20px for a
 * 169px button, which does not wrap — `Toolbar` lays its children out in one
 * line — so the action overhung the detail pane instead. Width is therefore
 * not a detail of this component; it is the reason it is mounted where it is.
 *
 * It is a `Toolbar` rather than a bare flex div because that is what a row of
 * controls is — React Aria then owns the arrow-key traversal between them
 * (`heroui-design-principles.md` §1).
 */
export const CustomerToolbar = ({
  query,
  onQueryChange,
}: CustomerToolbarProps): ReactElement => {
  const { t } = useTranslation('customer');

  return (
    <Toolbar
      aria-label={t('directory.toolbar')}
      className="w-full flex-wrap items-center justify-between gap-3"
    >
      <CustomerSearchField value={query} onChange={onQueryChange} />
      <RecordCustomerAction />
    </Toolbar>
  );
};
