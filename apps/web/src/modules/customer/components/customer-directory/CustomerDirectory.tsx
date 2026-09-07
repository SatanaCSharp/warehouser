import { Tabs } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CustomerDetailPane } from 'modules/customer/components/customer-directory/components/CustomerDetailPane';
import { CustomerCatalogue } from 'modules/customer/components/customer-directory/components/customers/CustomerCatalogue';
import { CustomerToolbar } from 'modules/customer/components/customer-directory/components/customers/CustomerToolbar';
import { useCustomers } from 'modules/customer/hooks/queries/useCustomers';
import { Conditional } from 'shared/components/Conditional';

import type { Customer } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

/** The two tabs the customers filter offers (`Hh6Al`); order never changes. */
const TAB_KEYS = ['active', 'inactive'] as const;

type TabKey = (typeof TAB_KEYS)[number];

/**
 * Whether a Customer belongs on each tab. AC-06 keeps an Inactive Customer
 * readable and counting exactly as before, so it moves tab rather than
 * disappearing from the destination.
 */
const TAB_PREDICATES: Record<TabKey, (customer: Customer) => boolean> = {
  active: (customer) => customer.deactivatedAt === null,
  inactive: (customer) => customer.deactivatedAt !== null,
};

/**
 * The Customers destination's composition root (frames `KRDln` desktop,
 * `b7gaH9` mobile): the `Active / Inactive` filter, the 340px customer list,
 * and the fill detail pane carrying identity → delivery addresses → what the
 * Customer awaits, in that order at both viewports.
 *
 * It owns the tab and the selection the two columns share, and nothing else.
 * Everything about how the collection is presented belongs to
 * `CustomerCatalogue`; the dialogs a card's kebab opens belong to
 * `CustomerCardList`, the narrowest ancestor of the cards that open them, so
 * no callback travels further than card → menu
 * (`writing-web-components.md` §4); everything about one Customer belongs to
 * `CustomerDetailPane`. What is left here is orchestration only
 * (`writing-web-components.md` §3).
 *
 * At 390px the list and the detail become two screens: opening a Customer
 * hides the list and shows the detail with its `chevron-left` "All customers"
 * back affordance; from `lg:` up both are always on screen. This is the one
 * layout branch driven by viewport rather than by data, so it stays a pair of
 * Tailwind visibility classes rather than a rendered branch — the same shape
 * `PurchaseDraftWorkspace` already ships.
 */
export const CustomerDirectory = (): ReactElement => {
  const { t } = useTranslation('customer');
  const customers = useCustomers();
  const [tab, setTab] = useState<TabKey>('active');
  // What was typed into the toolbar's search field. It sits here rather than
  // with the collection it filters because the frame puts the field in a row
  // spanning the destination, above the list-and-detail split: the field and
  // the list it filters are no longer the same subtree, and this is their
  // nearest common owner (`writing-web-components.md` §8).
  const [query, setQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<
    string | undefined
  >(undefined);

  const onSelectTab = (key: unknown): void => {
    if (
      typeof key === 'string' &&
      (TAB_KEYS as readonly string[]).includes(key)
    ) {
      setTab(key as TabKey);
      setQuery('');
      setSelectedCustomerId(undefined);
    }
  };

  const onSelectCustomer = (customerId: string): void =>
    setSelectedCustomerId(customerId);
  const onBackToList = (): void => setSelectedCustomerId(undefined);

  const visibleCustomers = customers.filter(TAB_PREDICATES[tab]);
  // Whether this tab has anything to search at all. It is the same condition
  // `CustomerCatalogue` resolves to its `empty` state, read here because the
  // toolbar now sits above that state rather than inside it.
  const hasCustomers = visibleCustomers.length > 0;
  const selectedCustomer = visibleCustomers.find(
    (customer) => customer.id === selectedCustomerId,
  );

  return (
    <Tabs className="mt-6" selectedKey={tab} onSelectionChange={onSelectTab}>
      <Tabs.ListContainer>
        <Tabs.List aria-label={t('directory.filter.label')}>
          {TAB_KEYS.map((key) => (
            <Tabs.Tab id={key} key={key}>
              {t(`directory.filter.${key}`, {
                count: customers.filter(TAB_PREDICATES[key]).length,
              })}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>

      {TAB_KEYS.map((key) => (
        <Tabs.Panel className="pt-5" id={key} key={key}>
          {/* The toolbar spans the destination above the split, which is where
              the frame puts it and the only width at which the 320px field and
              the primary action fit on one line. It belongs to the list, so on
              a phone showing the detail instead it goes with it, and a tab
              with nothing in it renders no search over its empty state. */}
          <Conditional when={hasCustomers}>
            <div className={selectedCustomerId ? 'hidden lg:block' : 'block'}>
              <CustomerToolbar query={query} onQueryChange={setQuery} />
            </div>
          </Conditional>

          <div className="mt-4 flex gap-6">
            <div
              className={`w-full lg:w-[340px] lg:shrink-0 ${
                selectedCustomerId ? 'hidden lg:block' : 'block'
              }`}
            >
              <CustomerCatalogue
                customers={visibleCustomers}
                query={query}
                selectedCustomerId={selectedCustomerId}
                tab={key}
                onSelect={onSelectCustomer}
              />
            </div>
            <div
              className={`min-w-0 flex-1 ${
                selectedCustomerId ? 'block' : 'hidden lg:block'
              }`}
            >
              <CustomerDetailPane
                customer={selectedCustomer}
                onBack={onBackToList}
              />
            </div>
          </div>
        </Tabs.Panel>
      ))}
    </Tabs>
  );
};
