/** Whether the Warehouse a User last selected is still one they may act in.
 *
 * A stored selection outlives the membership and the Warehouse itself — a Warehouse can be archived,
 * or the membership withdrawn, between one session and the next — so reading the selection back is
 * never enough on its own. This is the question that makes a stale selection fall back rather than
 * be served.
 *
 * Takes the live set and the stored identifier as arguments rather than reaching for either, which
 * is what keeps it usable from the read that already has both in hand. */
export const isSelectionStillLive = (
  liveWarehouses: ReadonlyArray<{ readonly warehouseId: string }>,
  storedActiveWarehouseId: string | null,
): boolean =>
  liveWarehouses.some(
    (warehouse) => warehouse.warehouseId === storedActiveWarehouseId,
  );
