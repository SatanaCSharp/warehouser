import { Button, Card, Separator } from '@heroui/react';
import type { Customer } from '@warehouser/contracts/customers';
import { CustomerAddressBook } from 'modules/customer/components/customer-directory/components/addresses/CustomerAddressBook';
import { CustomerAwaitingList } from 'modules/customer/components/customer-directory/components/awaiting/CustomerAwaitingList';
import { CustomerDetailHeader } from 'modules/customer/components/customer-directory/components/customers/CustomerDetailHeader';
import { useCustomerDetail } from 'modules/customer/hooks/queries/useCustomerDetail';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { DatasetSkeleton } from 'shared/components/DatasetSkeleton';
import { useContentTransition } from 'shared/hooks/effects/useContentTransition';
import { ChevronLeftIcon } from 'shared/icons';

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
 * **identity → delivery addresses → what they await**, drawn on a bordered
 * surface with a rule between each of the three (`HeroUI/Card` `XqCT2`,
 * `HeroUI/Separator` `q4Imu`).
 *
 * The identity block is `CustomerDetailHeader`, which also carries the
 * Customer's actions kebab and the dialogs it opens; this pane owns the read
 * and the arrangement, and nothing that acts on the Customer.
 *
 * It reads the Customer's detail itself rather than being handed it: the
 * awaiting list is three hops below the page, which is one more than a value
 * may travel (`writing-web-components.md` §4), and RTK Query deduplicates the
 * subscription.
 *
 * The `chevron-left` back affordance is the mobile screen's only way out of
 * the detail, so it is rendered whenever a Customer is open and hidden from
 * `lg:` up, where the list is on screen beside it. It is a dismissive
 * navigation control, which is what `Button variant="tertiary"` means — HeroUI
 * provides the control, so nothing here hand-rolls a native `<button>` and its
 * layout classes (`frontend-architecture.md` §Components,
 * `heroui-design-principles.md` §1).
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

  // The pane re-enters both when another Customer is opened and when what it
  // is showing for that Customer changes — the skeleton arriving, then the
  // Customer replacing it. Keying on the identity alone would animate the
  // skeleton in and then swap the real content behind it without a frame of
  // motion, which is the jump the transition exists to remove.
  const paneRef = useContentTransition<HTMLDivElement>(
    `${customer?.id ?? 'none'}:${detailState}`,
  );

  // The three blocks read the Customer they were opened for, so the element is
  // resolved before the return rather than gated inline — `Conditional` builds
  // both arms (`writing-web-conditional-components.md` §2). It is reached only
  // under `ready`, which holds exactly when the detail is there.
  //
  // The pane is a bordered surface with the identity in the card's header slot
  // and the two sections in its content slot, ruled off from one another
  // rather than only spaced apart (frame `KRDln`, preview
  // `customers-desktop-v1.html`). Each section carries its own **leading**
  // rule inside its own block, so a rule is never left behind by the block it
  // introduces — the arrangement `WarehouseDetailPane` already ships.
  const sections =
    detail === undefined ? null : (
      <Card className="border border-border shadow-none">
        <CustomerDetailHeader detail={detail} />
        <Card.Content className="flex flex-col gap-6">
          <Separator />
          <CustomerAddressBook customer={detail} />
          <Separator />
          <CustomerAwaitingList detail={detail} />
        </Card.Content>
      </Card>
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
    <div ref={paneRef}>
      <Conditional when={customer !== undefined}>
        <Button
          className="mb-3 lg:hidden"
          size="sm"
          variant="tertiary"
          onPress={onBack}
        >
          <ChevronLeftIcon />
          {t('detail.back')}
        </Button>
      </Conditional>
      {content[detailState]}
    </div>
  );
};
