import type {
  CustomerOrder,
  CustomerOrderAmend,
  CustomerOrderCancellation,
  CustomerOrderRedirect,
  DemandLine,
} from '@warehouser/contracts/customer-orders';
import {
  useAmendCustomerOrderMutation,
  useCancelCustomerOrderMutation,
  useRedirectCustomerOrderMutation,
} from 'modules/customer-order/api/customer-order-api';
import { AmendCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/AmendCustomerOrderDialog';
import { CancelCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/CancelCustomerOrderDialog';
import { DemandCardList } from 'modules/customer-order/components/demand-directory/components/DemandCardList';
import { DemandCoverageNote } from 'modules/customer-order/components/demand-directory/components/DemandCoverageNote';
import { DemandEmptyState } from 'modules/customer-order/components/demand-directory/components/DemandEmptyState';
import { DemandSearchField } from 'modules/customer-order/components/demand-directory/components/DemandSearchField';
import { DemandTable } from 'modules/customer-order/components/demand-directory/components/DemandTable';
import { RecordDemandAction } from 'modules/customer-order/components/demand-directory/components/RecordDemandAction';
import { RedirectCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/RedirectCustomerOrderDialog';
import { useCustomerOrderNaming } from 'modules/customer-order/hooks/projections/useCustomerOrderNaming';
import { matchesDemandQuery } from 'modules/customer-order/utils/demand-search';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MutationResult } from 'shared/api/client/mutation-outcome';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { ArchivedWarehouseChip } from 'shared/components/ArchivedWarehouseChip';
import { ArchivedWarehouseNotice } from 'shared/components/ArchivedWarehouseNotice';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

/** Which per-Customer-Order dialog a sub-row opens. */
type CustomerOrderDialogKind = 'amend' | 'cancel' | 'redirect';

/** What the destination presents instead of, or alongside, its rows. */
type DemandListState = 'empty' | 'noMatches' | 'ready';

type DemandDirectoryProps = {
  demandLines: DemandLine[];
};

type DemandListReading = { demandCount: number; matchCount: number };

/**
 * Which state displaces the rows, most significant first — an ordered table
 * rather than the order of `else if` lines (`writing-web-components.md` §6).
 * `empty` outranks `noMatches` because a Warehouse holding no demand at all is
 * not a search that found nothing, and the two say different things.
 */
const displacingStates: readonly {
  state: DemandListState;
  holds: (reading: DemandListReading) => boolean;
}[] = [
  { state: 'empty', holds: ({ demandCount }) => demandCount === 0 },
  { state: 'noMatches', holds: ({ matchCount }) => matchCount === 0 },
];

const resolveListState = (reading: DemandListReading): DemandListState =>
  displacingStates.find(({ holds }) => holds(reading))?.state ?? 'ready';

/**
 * The Demand destination's list owner (design-handoff.md `G6jhw` desktop /
 * `SjdPo` mobile): the search field and the record-demand trigger above the two
 * responsive surfaces that present consolidated demand, the coverage note below
 * them, and the amend/cancel dialogs their expanded Customer Orders open.
 *
 * What is left here is orchestration only — the Warehouse it mutates against,
 * the two mutations, the search term, and which dialog is open for which order.
 * How a row or a card is drawn belongs to `DemandTable` and `DemandCardList`,
 * and each reads its own data (`writing-web-components.md` §3).
 *
 * The search term is filtered client-side over the demand the route already
 * loaded, which `utils/demand-search.ts` records the reasoning for; it lives
 * here rather than in either surface because both render the same filtered
 * collection (`writing-web-components.md` §8).
 *
 * AC-23 — an archived Warehouse is entered read-only rather than being
 * unreachable, so the notice is rendered once here and every mutating control
 * below states its own disabled reason by pointing at it.
 *
 * `useEnteredWarehouse()` reads the Warehouse this directory mutates against
 * directly, exactly as `ItemDirectory` does.
 */
export const DemandDirectory = ({
  demandLines,
}: DemandDirectoryProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const warehouseId = useEnteredWarehouse();
  const naming = useCustomerOrderNaming();
  const dialog = useActionDialog<CustomerOrderDialogKind, CustomerOrder>();
  const [amendCustomerOrder] = useAmendCustomerOrderMutation();
  const [cancelCustomerOrder] = useCancelCustomerOrderMutation();
  const [redirectCustomerOrder] = useRedirectCustomerOrderMutation();
  const [query, setQuery] = useState('');

  const trimmedQuery = query.trim();
  const visibleLines = demandLines.filter(matchesDemandQuery(trimmedQuery));
  const listState = resolveListState({
    demandCount: demandLines.length,
    matchCount: visibleLines.length,
  });

  const onAmend = (order: CustomerOrder): void => dialog.open('amend', order);
  const onCancel = (order: CustomerOrder): void => dialog.open('cancel', order);
  const onRedirect = (order: CustomerOrder): void =>
    dialog.open('redirect', order);

  const onSaveAmendment =
    (order: CustomerOrder) =>
    (input: CustomerOrderAmend): Promise<MutationResult> =>
      amendCustomerOrder({
        customerName: naming(order),
        warehouseId: warehouseId ?? '',
        customerOrderId: order.id,
        input,
      });

  const onSaveCancellation =
    (order: CustomerOrder) =>
    (input: CustomerOrderCancellation): Promise<MutationResult> =>
      cancelCustomerOrder({
        customerName: naming(order),
        warehouseId: warehouseId ?? '',
        customerOrderId: order.id,
        input,
      });

  const onSaveRedirection =
    (order: CustomerOrder) =>
    (input: CustomerOrderRedirect): Promise<MutationResult> =>
      redirectCustomerOrder({
        customerName: naming(order),
        warehouseId: warehouseId ?? '',
        customerOrderId: order.id,
        input,
      });

  const heading = t('demand.heading');

  // The search field and the record-demand trigger are drawn together above the
  // rows (`G6jhw`); the empty state carries the trigger itself, so this row is
  // withheld there rather than offering the same control twice.
  const controls = (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
      <DemandSearchField value={query} onChange={setQuery} />
      <RecordDemandAction />
    </div>
  );

  const content: Record<DemandListState, ReactElement> = {
    empty: <DemandEmptyState />,
    noMatches: (
      <>
        {controls}
        <p role="status" className="mt-6 text-muted">
          {t('demand.noMatches', { query: trimmedQuery })}
        </p>
      </>
    ),
    ready: (
      <>
        {controls}
        <DemandTable
          demandLines={visibleLines}
          label={heading}
          onAmend={onAmend}
          onCancel={onCancel}
          onRedirect={onRedirect}
        />
        <DemandCardList
          demandLines={visibleLines}
          label={heading}
          onAmend={onAmend}
          onCancel={onCancel}
          onRedirect={onRedirect}
        />
        <DemandCoverageNote />
      </>
    ),
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-foreground">{heading}</h1>
        <ArchivedWarehouseChip />
      </div>
      <p className="mt-3 max-w-prose text-muted">{t('demand.lede')}</p>

      <div className="mt-4">
        <ArchivedWarehouseNotice />
      </div>

      {content[listState]}

      <ActionDialogHost
        controller={dialog}
        renderDialogs={{
          amend: (order) => (
            <AmendCustomerOrderDialog
              order={order}
              onSave={onSaveAmendment(order)}
            />
          ),
          cancel: (order) => (
            <CancelCustomerOrderDialog
              order={order}
              onSave={onSaveCancellation(order)}
            />
          ),
          redirect: (order) => (
            <RedirectCustomerOrderDialog
              order={order}
              onSave={onSaveRedirection(order)}
            />
          ),
        }}
      />
    </div>
  );
};
