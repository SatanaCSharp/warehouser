import { PermissionId } from '@warehouser/shared-types/enums';

import { DirectDestinationPickers } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/direct-destination-fields/components/DirectDestinationPickers';
import { WarehousePermissionGate } from 'shared/components/WarehousePermissionGate';

import type { DirectDestinationPickersProps } from 'modules/purchase-draft/components/purchase-draft-line-delivery/components/direct-destination-fields/components/DirectDestinationPickers';
import type { ReactNode } from 'react';

/**
 * The gate around `DirectDestinationPickers`. It is separate so the Customers
 * read they depend on is never issued for an actor the gate closes over —
 * nothing is requested for a dataset the actor may not read
 * (design-handoff.md §States).
 *
 * A member without `CUSTOMERS:WATCH` is therefore offered no way to redirect a
 * line to a customer, and reads the destination that line already states
 * through `PurchaseDraftLineDestination`'s withheld arm instead (AC-09a).
 */
export const DirectDestinationFields = (
  props: DirectDestinationPickersProps,
): ReactNode => (
  <WarehousePermissionGate permission={PermissionId.CUSTOMERS_WATCH}>
    <DirectDestinationPickers {...props} />
  </WarehousePermissionGate>
);
