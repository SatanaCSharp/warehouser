import { useTranslation } from 'react-i18next';

import { CustomerAddressBook } from 'modules/customer/components/customer-directory/components/addresses/CustomerAddressBook';
import { CustomerAwaitingList } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingList';
import { useCustomerDetail } from 'modules/customer/hooks/queries/useCustomerDetail';
import { Conditional } from 'shared/components/Conditional';
import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';
import { ChevronLeftIcon } from 'shared/icons';

import type { Customer } from '@warehouser/contracts/customers';
import type { ReactElement } from 'react';

export type CustomerDetailPaneProps = {
  /** The opened Customer, or nothing while the list is all that is on screen. */
  customer: Customer | undefined;
  onBack: () => void;
};

/** What the detail column shows, most significant state first. */
type DetailState = 'unselected' | 'failed' | 'pending' | 'ready';

type DetailReading = {
  hasSelection: boolean;
  hasDetail: boolean;
  isError: boolean;
};

/**
 * The states that displace the detail pane, in precedence order
 * (`writing-web-components.md` §6).
 *
 * Nothing selected wins outright: no read was made, so neither of the other
 * two can be true of anything. A failed read then wins over a pending one,
 * because `useCustomerDetail` reports both as "no detail yet" and only the
 * flag tells them apart — reading them the other way round leaves a member who
 * will never get this Customer watching a skeleton for good.
 */
const DISPLACING_DETAIL_STATES: readonly {
  state: DetailState;
  holds: (reading: DetailReading) => boolean;
}[] = [
  { state: 'unselected', holds: ({ hasSelection }) => !hasSelection },
  { state: 'failed', holds: ({ isError }) => isError },
  { state: 'pending', holds: ({ hasDetail }) => !hasDetail },
];

/** The pane's own skeleton: an identity line, the addresses, the awaiting rows. */
const DETAIL_BARS = ['30%', '60%', '45%'] as const;

/**
 * One Customer, in the order both approved frames draw it and the order
 * design-handoff.md §Responsive behavior fixes for the mobile screen too:
 * **identity → delivery addresses → what they await**.
 *
 * It reads the Customer's detail itself rather than being handed it: the
 * awaiting list is three hops below the page, which is one more than a value
 * may travel (`writing-web-components.md` §4), and RTK Query deduplicates the
 * subscription.
 *
 * The `chevron-left` back affordance is the mobile screen's only way out of
 * the detail, so it is rendered whenever a Customer is open and hidden from
 * `lg:` up, where the list is on screen beside it.
 */
export const CustomerDetailPane = ({
  customer,
  onBack,
}: CustomerDetailPaneProps): ReactElement => {
  const { t } = useTranslation('customer');
  const { detail, isError } = useCustomerDetail(customer?.id);

  const detailState =
    DISPLACING_DETAIL_STATES.find(({ holds }) =>
      holds({
        hasDetail: detail !== undefined,
        hasSelection: customer !== undefined,
        isError,
      }),
    )?.state ?? 'ready';

  // The two sections read the Customer they were opened for, so the element is
  // resolved before the return rather than gated inline — `Conditional` builds
  // both arms (`writing-web-conditional-components.md` §2). It is reached only
  // under `ready`, which holds exactly when the detail is there.
  const sections =
    detail === undefined ? null : (
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            {detail.name}
          </h2>
        </div>
        <CustomerAddressBook customer={detail} />
        <CustomerAwaitingList detail={detail} />
      </div>
    );

  const content: Record<DetailState, ReactElement> = {
    unselected: <p className="text-muted">{t('detail.empty')}</p>,
    pending: (
      <DatasetSkeleton
        columns={DETAIL_BARS}
        label={t('detail.loading')}
        rows={2}
      />
    ),
    failed: (
      <p className="text-danger" role="alert">
        {t('detail.error')}
      </p>
    ),
    ready: <>{sections}</>,
  };

  return (
    <div>
      <Conditional when={customer !== undefined}>
        <button
          className="mb-3 inline-flex items-center gap-1 text-sm lg:hidden"
          type="button"
          onClick={onBack}
        >
          <ChevronLeftIcon />
          {t('detail.back')}
        </button>
      </Conditional>
      {content[detailState]}
    </div>
  );
};
