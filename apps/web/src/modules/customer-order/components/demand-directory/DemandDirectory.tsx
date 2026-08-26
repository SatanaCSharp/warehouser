import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useAmendCustomerOrderMutation,
  useCancelCustomerOrderMutation,
} from 'modules/customer-order/api/customer-order-api';
import { AmendCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/AmendCustomerOrderDialog';
import { CancelCustomerOrderDialog } from 'modules/customer-order/components/demand-directory/components/CancelCustomerOrderDialog';
import { DemandCardMobile } from 'modules/customer-order/components/demand-directory/components/DemandCardMobile';
import { DemandRow } from 'modules/customer-order/components/demand-directory/components/DemandRow';
import { RecordDemandAction } from 'modules/customer-order/components/demand-directory/components/RecordDemandAction';
import { Conditional } from 'shared/components/Conditional';
import { DialogHost } from 'shared/components/DialogHost';
import { useEnteredWarehouse } from 'shared/hooks/projections/useEnteredWarehouse';

import type {
  CustomerOrder,
  CustomerOrderAmend,
  CustomerOrderCancellation,
  DemandLine,
} from '@warehouser/contracts/customer-orders';
import type { ReactElement } from 'react';
import type { MutationResult } from 'shared/api/client/mutation-outcome';

/** Which Customer Order dialog the directory has opened, and for which order. */
type CustomerOrderDialog =
  | { kind: 'amend'; order: CustomerOrder }
  | { kind: 'cancel'; order: CustomerOrder };

type DemandDirectoryProps = {
  demandLines: DemandLine[];
};

/**
 * The Demand destination's list owner (design-handoff.md `G6jhw` desktop /
 * `SjdPo` mobile): the table from the split-view breakpoint up, one card per
 * Item below it, and the amend/cancel dialogs its expanded sub-rows open.
 * Recording demand is its own self-contained workflow, `RecordDemandAction`.
 *
 * `useEnteredWarehouse()` reads the Warehouse this directory mutates against
 * directly, exactly as `ItemDirectory` does.
 */
export const DemandDirectory = ({
  demandLines,
}: DemandDirectoryProps): ReactElement => {
  const { t } = useTranslation('customer-order');
  const warehouseId = useEnteredWarehouse();
  const [dialog, setDialog] = useState<CustomerOrderDialog | null>(null);
  const [amendCustomerOrder] = useAmendCustomerOrderMutation();
  const [cancelCustomerOrder] = useCancelCustomerOrderMutation();

  const onCloseDialog = (): void => setDialog(null);
  const onAmend = (order: CustomerOrder): void =>
    setDialog({ kind: 'amend', order });
  const onCancel = (order: CustomerOrder): void =>
    setDialog({ kind: 'cancel', order });

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

  // Every dialog reads the Customer Order its sub-row was opened for, so the
  // open one is resolved by a lookup here rather than gated inline
  // (`writing-web-conditional-components.md` §2): `DialogHost` holds the open
  // state a sub-row is not a control the dialog can sit beside.
  const openDialog =
    dialog === null ? null : (
      <DialogHost onClose={onCloseDialog}>
        {
          {
            amend: (
              <AmendCustomerOrderDialog
                order={dialog.order}
                onSave={onSaveAmendment(dialog.order)}
              />
            ),
            cancel: (
              <CancelCustomerOrderDialog
                order={dialog.order}
                onSave={onSaveCancellation(dialog.order)}
              />
            ),
          }[dialog.kind]
        }
      </DialogHost>
    );

  const heading = t('demand.heading');

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
        <RecordDemandAction />
      </div>

      <Conditional
        when={demandLines.length > 0}
        otherwise={<p className="mt-6 text-muted">{t('demand.empty')}</p>}
      >
        <table aria-label={heading} className="mt-4 hidden w-full lg:table">
          <thead>
            <tr>
              <th className="p-2 text-left">{t('demand.table.item')}</th>
              <th className="p-2 text-left">{t('demand.table.outstanding')}</th>
              <th className="p-2 text-left">{t('demand.table.neededBy')}</th>
              <th className="p-2 text-left">{t('demand.table.onHand')}</th>
              <th className="p-2 text-left">{t('demand.table.coveredBy')}</th>
              <th className="p-2 text-left">
                <span className="sr-only">{t('demand.table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {demandLines.map((line) => (
              <DemandRow
                key={line.itemId}
                line={line}
                onAmend={onAmend}
                onCancel={onCancel}
              />
            ))}
          </tbody>
        </table>

        <ul aria-label={heading} className="mt-4 grid gap-3 lg:hidden">
          {demandLines.map((line) => (
            <DemandCardMobile
              key={line.itemId}
              line={line}
              onAmend={onAmend}
              onCancel={onCancel}
            />
          ))}
        </ul>
      </Conditional>

      {openDialog}
    </div>
  );
};
