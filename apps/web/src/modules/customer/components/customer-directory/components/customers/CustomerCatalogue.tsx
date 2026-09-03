import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CustomerCardList } from 'modules/customer/components/customer-directory/components/customers/CustomerCardList';
import { CustomerSearchField } from 'modules/customer/components/customer-directory/components/customers/CustomerSearchField';
import { RecordCustomerAction } from 'modules/customer/components/customer-directory/components/customers/RecordCustomerAction';
import { Conditional } from 'shared/components/Conditional';
import { DatasetEmptyState } from 'shared/components/DatasetEmptyState';
import { ContactIcon } from 'shared/icons';

import type { Customer } from '@warehouser/contracts/customers';
import type { CustomerActionHandlers } from 'modules/customer/hooks/projections/useCustomerActions';
import type { ReactElement } from 'react';

export type CustomerCatalogueProps = CustomerActionHandlers & {
  customers: Customer[];
  selectedCustomerId: string | undefined;
  /** Which filter tab this catalogue is the panel of. */
  tab: 'active' | 'inactive';
  onSelect: (customerId: string) => void;
};

/** Which of the collection's three mutually exclusive states is on screen. */
type CustomerCatalogueState = 'empty' | 'noMatches' | 'ready';

/**
 * What the empty state offers, per tab. A Warehouse that has recorded no
 * Customer at all is offered the one action that fills the list; an empty
 * `Inactive` tab is a fact about that tab and offers nothing, because an empty
 * state never invents a control. It is a lookup rather than a ternary, so the
 * element is built by one arm each and neither is spelled inside the JSX
 * (`writing-web-components.md` §6).
 */
const EMPTY_STATE_ACTIONS: Record<
  'active' | 'inactive',
  ReactElement | undefined
> = {
  active: <RecordCustomerAction />,
  inactive: undefined,
};

/** The states that displace the cards, most significant first. */
const DISPLACING_STATES: readonly {
  state: CustomerCatalogueState;
  holds: (reading: { customerCount: number; matchCount: number }) => boolean;
}[] = [
  { state: 'empty', holds: ({ customerCount }) => customerCount === 0 },
  { state: 'noMatches', holds: ({ matchCount }) => matchCount === 0 },
];

/**
 * The Customers collection and everything a member reads it through: the
 * search field, the `Record customer` action beside it, the 340px card list,
 * and the state that displaces them (frames `KRDln`, `b7gaH9`, tile `S9TOH`).
 *
 * The search term lives here and nowhere higher, because nothing outside this
 * collection reads it (`writing-web-components.md` §8), and it filters the
 * list the route already loaded rather than issuing a request.
 *
 * Which of the three states is on screen is resolved to a **name** and
 * rendered through a total `Record<State, ReactElement>` lookup, so adding a
 * state fails to compile until it is answered
 * (`writing-web-components.md` §6).
 *
 * The empty state's copy is the tab's own; what it offers is
 * `EMPTY_STATE_ACTIONS` above.
 */
export const CustomerCatalogue = ({
  customers,
  selectedCustomerId,
  tab,
  onCorrect,
  onDeactivate,
  onSelect,
}: CustomerCatalogueProps): ReactElement => {
  const { t } = useTranslation('customer');
  const [query, setQuery] = useState('');

  const term = query.trim().toLocaleLowerCase();
  const matches = customers.filter((customer) =>
    customer.name.toLocaleLowerCase().includes(term),
  );
  const state =
    DISPLACING_STATES.find(({ holds }) =>
      holds({ customerCount: customers.length, matchCount: matches.length }),
    )?.state ?? 'ready';

  const content: Record<CustomerCatalogueState, ReactElement> = {
    empty: (
      <DatasetEmptyState
        action={EMPTY_STATE_ACTIONS[tab]}
        description={t(`directory.empty.${tab}.description`)}
        heading={t(`directory.empty.${tab}.heading`)}
        icon={<ContactIcon />}
      />
    ),
    noMatches: (
      <p className="mt-6 text-muted" role="status">
        {t('directory.empty.noMatches', { query: query.trim() })}
      </p>
    ),
    ready: (
      <CustomerCardList
        customers={matches}
        label={t('directory.listLabel')}
        selectedCustomerId={selectedCustomerId}
        onCorrect={onCorrect}
        onDeactivate={onDeactivate}
        onSelect={onSelect}
      />
    ),
  };

  return (
    <div>
      {/* A Warehouse dealing with nobody has nothing to search and one thing
          to do, so the empty state carries the only `Record customer` on
          screen rather than a second one competing with the toolbar's. */}
      <Conditional when={state !== 'empty'}>
        <div className="flex flex-col gap-3">
          <CustomerSearchField value={query} onChange={setQuery} />
          <RecordCustomerAction />
        </div>
      </Conditional>

      {content[state]}
    </div>
  );
};
