import { useTranslation } from 'react-i18next';

import {
  useAmendCustomerOrderMutation,
  useCancelCustomerOrderMutation,
} from 'modules/customer-order/api/customer-order-api';
import { AmendCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/AmendCustomerOrderDialog';
import { CancelCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/CancelCustomerOrderDialog';
import { DemandCardList } from 'modules/customer-order/components/demand-directory/components/DemandCardList';
import { DemandTable } from 'modules/customer-order/components/demand-directory/components/DemandTable';
import { RecordDemandAction } from 'modules/customer-order/components/demand-directory/components/RecordDemandAction';
import { ActionDialogHost } from 'shared/components/ActionDialogHost';
import { Conditional } from 'shared/components/Conditional';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';
import { useActionDialog } from 'shared/hooks/state/useActionDialog';

import type {
  CustomerOrder,
  CustomerOrderAmend,
  CustomerOrderCancellation,
  DemandLine,
} from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/** Which per-Customer-Order dialog a sub-row opens. */
type CustomerOrderDialogKind = 'amend' | 'cancel';

type DemandDirectoryProps = {
  demandLines: DemandLine[];
};

/**
 * The Demand destination's list owner (design-handoff.md `G6jhw` desktop /
 * `SjdPo` mobile): the two responsive surfaces that present consolidated
 * demand, and the amend/cancel dialogs their expanded Customer Orders open.
 * Recording demand is its own self-contained workflow, `RecordDemandAction`.
 *
 * What is left here is orchestration only — the Warehouse it mutates against,
 * the two mutations, and which dialog is open for which order. How a row or a
 * card is drawn belongs to `DemandTable` and `DemandCardList`, and each reads
 * its own data (`writing-web-components.md` §3).
 *
 * `useEnteredWarehouse()` reads the Warehouse this directory mutates against
 * directly, exactly as `ItemDirectory` does.
 */
export const DemandDirectory = ({
  demandLines,
}: DemandDirectoryProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const warehouseId = useEnteredWarehouse();
  const dialog = useActionDialog<CustomerOrderDialogKind, CustomerOrder>();
  const [amendCustomerOrder] = useAmendCustomerOrderMutation();
  const [cancelCustomerOrder] = useCancelCustomerOrderMutation();

  const onAmend = (order: CustomerOrder): void => dialog.open('amend', order);
  const onCancel = (order: CustomerOrder): void => dialog.open('cancel', order);

  const onSaveAmendment =
    (order: CustomerOrder) =>
    (input: CustomerOrderAmend): Promise<MutationResult> =>
      amendCustomerOrder({
        warehouseId: warehouseId ?? '',
        customerOrderId: order.id,
        input,
      });

  const onSaveCancellation =
    (order: CustomerOrder) =>
    (input: CustomerOrderCancellation): Promise<MutationResult> =>
      cancelCustomerOrder({
        warehouseId: warehouseId ?? '',
        customerOrderId: order.id,
        input,
      });

  const heading = t('demand.heading');

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
        <RecordDemandAction />
      </div>

      {/* One empty message for both surfaces, rather than the table's own
          `renderEmptyState` and the card list's repeating it: they are two
          renderings of one destination, and both are in the document at every
          width. */}
      <Conditional
        when={demandLines.length > 0}
        otherwise={<p className="mt-6 text-muted">{t('demand.empty')}</p>}
      >
        <DemandTable
          demandLines={demandLines}
          label={heading}
          onAmend={onAmend}
          onCancel={onCancel}
        />
        <DemandCardList
          demandLines={demandLines}
          label={heading}
          onAmend={onAmend}
          onCancel={onCancel}
        />
      </Conditional>

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
        }}
      />
    </div>
  );
};
