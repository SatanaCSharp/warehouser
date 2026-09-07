import { useTranslation } from 'react-i18next';

import { CustomerCardList } from 'modules/customer/components/customer-directory/components/customers/CustomerCardList';
import { RecordCustomerAction } from 'modules/customer/components/customer-directory/components/customers/RecordCustomerAction';
import { DatasetEmptyState } from 'shared/components/DatasetEmptyState';
import { ContactIcon } from 'shared/icons';

import type { Customer } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerCatalogueProps = {
  customers: Customer[];
  /**
   * What was typed into the destination's search field. It arrives as a prop
   * rather than being owned here because the field that sets it is in the
   * toolbar above the split, which spans the destination rather than this
   * column (`CustomerToolbar`).
   */
  query: string;
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

/**
 * Whether one Customer answers what was typed into the search field.
 *
 * The design's field is `Search customers or addresses` (frame `KRDln`), so a
 * member who remembers where the goods go rather than who ordered them still
 * finds the Customer: the term is tested against the name **and** against the
 * text of every Delivery Address the Customer carries, active and Inactive
 * alike, because an Inactive address is still what a member remembers typing.
 *
 * Access notes are deliberately not searched: they are what a driver needs to
 * get in, not an identifier, and matching a gate code would put confidential
 * text (spec.md §6.1) behind a guessable probe.
 */
const matchesSearchTerm = (customer: Customer, term: string): boolean =>
  customer.name.toLocaleLowerCase().includes(term) ||
  customer.deliveryAddresses.some((address) =>
    address.addressText.toLocaleLowerCase().includes(term),
  );

/** The states that displace the cards, most significant first. */
const DISPLACING_STATES: readonly {
  state: CustomerCatalogueState;
  holds: (reading: { customerCount: number; matchCount: number }) => boolean;
}[] = [
  { state: 'empty', holds: ({ customerCount }) => customerCount === 0 },
  { state: 'noMatches', holds: ({ matchCount }) => matchCount === 0 },
];

/**
 * The Customers collection itself: the 340px card list and the state that
 * displaces it (frames `KRDln`, `b7gaH9`, tile `S9TOH`).
 *
 * The search **term** is applied here and the search **field** is not: the
 * frame puts the field in a toolbar spanning the destination above the
 * list-and-detail split, so it is `CustomerToolbar` that owns the markup and
 * `CustomerDirectory` that holds the term for both. Filtering stays here
 * because this is the collection being filtered, and it filters the list the
 * route already loaded rather than issuing a request.
 *
 * Which of the three states is on screen is resolved to a **name** and
 * rendered through a total `Record<State, ReactElement>` lookup, so adding a
 * state fails to compile until it is answered
 * (`writing-web-components.md` §6).
 *
 * The empty state's copy is the tab's own; what it offers is
 * `EMPTY_STATE_ACTIONS` above — a Warehouse dealing with nobody has nothing to
 * search, so `CustomerDirectory` renders no toolbar over it and this is the
 * only `Record customer` on screen.
 */
export const CustomerCatalogue = ({
  customers,
  query,
  selectedCustomerId,
  tab,
  onSelect,
}: CustomerCatalogueProps): ReactElement => {
  const { t } = useTranslation('customer');

  const term = query.trim().toLocaleLowerCase();
  const matches = customers.filter((customer) =>
    matchesSearchTerm(customer, term),
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
        onSelect={onSelect}
      />
    ),
  };

  return <div>{content[state]}</div>;
};
