import { Tabs } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useCorrectCustomerNameMutation,
  useDeactivateCustomerMutation,
} from 'modules/customer/api/customer-api';
import { CustomerDetailPane } from 'modules/customer/components/customer-directory/components/CustomerDetailPane';
import { CorrectCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/CorrectCustomerDialog';
import { CustomerCatalogue } from 'modules/customer/components/customer-directory/components/customers/CustomerCatalogue';
import { DeactivateCustomerDialog } from 'modules/customer/components/customer-directory/components/customers/DeactivateCustomerDialog';
import { useCustomers } from 'modules/customer/hooks/queries/useCustomers';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

import type { Customer, CustomerUpdate } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/** The two tabs the customers filter offers (`Hh6Al`); order never changes. */
const TAB_KEYS = ['active', 'inactive'] as const;

type TabKey = (typeof TAB_KEYS)[number];

/** Which per-Customer dialog a card's kebab opens. */
type CustomerDialogKind = 'correct' | 'deactivate';

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
 * It owns the Warehouse its customer-level mutations are addressed to, which
 * dialog is open for which Customer, and the selection the two columns share.
 * Everything about how the collection is presented belongs to
 * `CustomerCatalogue`; everything about one Customer belongs to
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
  const warehouseId = useEnteredWarehouse();
  const customers = useCustomers();
  const [tab, setTab] = useState<TabKey>('active');
  const [selectedCustomerId, setSelectedCustomerId] = useState<
    string | undefined
  >(undefined);
  const dialog = useActionDialog<CustomerDialogKind, Customer>();
  const [correctCustomerName] = useCorrectCustomerNameMutation();
  const [deactivateCustomer] = useDeactivateCustomerMutation();

  const onSelectTab = (key: unknown): void => {
    if (
      typeof key === 'string' &&
      (TAB_KEYS as readonly string[]).includes(key)
    ) {
      setTab(key as TabKey);
      setSelectedCustomerId(undefined);
    }
  };

  const onSelectCustomer = (customerId: string): void =>
    setSelectedCustomerId(customerId);
  const onBackToList = (): void => setSelectedCustomerId(undefined);

  // The two reports a card's kebab sends upward. Each only names the Customer
  // a dialog was chosen for, which is the single thing a cached row renderer
  // may close over
  // (`docs/system/adr/27-08-2026-heroui-table-for-web-data-tables.md`).
  const onCorrect = (customer: Customer): void =>
    dialog.open('correct', customer);
  const onDeactivate = (customer: Customer): void =>
    dialog.open('deactivate', customer);

  // Each command carries what its success toast names the Customer by, beside
  // the id that addresses it: a correction is reported by the name it leaves
  // behind, which is what the member just committed. The address text never
  // rides along — it is confidential and a toast outlives the dialog that
  // showed it (spec.md §6.1).
  const onSaveCorrection =
    (customer: Customer) =>
    (input: CustomerUpdate): Promise<MutationResult> =>
      correctCustomerName({
        customerName: input.name,
        warehouseId: warehouseId ?? '',
        customerId: customer.id,
        input,
      });

  const onConfirmDeactivate =
    (customer: Customer) => (): Promise<MutationResult> =>
      deactivateCustomer({
        customerName: customer.name,
        warehouseId: warehouseId ?? '',
        customerId: customer.id,
      });

  const visibleCustomers = customers.filter(TAB_PREDICATES[tab]);
  const selectedCustomer = visibleCustomers.find(
    (customer) => customer.id === selectedCustomerId,
  );

  return (
    <Tabs className="mt-6" selectedKey={tab} onSelectionChange={onSelectTab}>
      <Tabs.ListContainer>
        <Tabs.List aria-label={t('directory.filter.label')}>
          {TAB_KEYS.map((key) => (
            <Tabs.Tab id={key} key={key}>
              {t(`directory.filter.${key}`)}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>

      {TAB_KEYS.map((key) => (
        <Tabs.Panel className="pt-5" id={key} key={key}>
          <div className="flex gap-6">
            <div
              className={`w-full lg:w-[340px] lg:shrink-0 ${
                selectedCustomerId ? 'hidden lg:block' : 'block'
              }`}
            >
              <CustomerCatalogue
                customers={visibleCustomers}
                selectedCustomerId={selectedCustomerId}
                tab={key}
                onCorrect={onCorrect}
                onDeactivate={onDeactivate}
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

      <ActionDialogHost
        controller={dialog}
        renderDialogs={{
          correct: (customer) => (
            <CorrectCustomerDialog
              customer={customer}
              onSave={onSaveCorrection(customer)}
            />
          ),
          deactivate: (customer) => (
            <DeactivateCustomerDialog
              customer={customer}
              onConfirm={onConfirmDeactivate(customer)}
            />
          ),
        }}
      />
    </Tabs>
  );
};
