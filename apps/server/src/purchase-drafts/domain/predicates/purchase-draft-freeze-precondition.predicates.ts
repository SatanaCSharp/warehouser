import { isDefined } from '@warehouser/utils/predicates';
import { DeliveryMode } from 'purchase-drafts/domain/value-objects/delivery-mode';
import type { FreezableLine } from 'purchase-drafts/usecases/commands/ready-purchase-draft.command';

// AC-16a — the freeze precondition, stated as a pure condition over the two things it is about: how
// this draft's lines travel, and whether the Warehouse has an address at all. Kept beside its one
// implementation rather than promoted to `domain/predicates/` (server-error-handling.md §1) — the
// freeze is the only moment it applies, which is exactly what makes it a **freeze precondition and
// not a line-level one**: a line coming to the dock is composed, revised and linked perfectly well
// while the Warehouse has no address, and only the statement made to the supplier requires one.
export const warehouseAddressCoversEveryViaWarehouseLine = (
  lines: readonly FreezableLine[],
  warehouseDeliveryAddressText: string | null,
): boolean =>
  isDefined(warehouseDeliveryAddressText) ||
  !lines.some((line) => line.deliveryMode === DeliveryMode.ViaWarehouse);
