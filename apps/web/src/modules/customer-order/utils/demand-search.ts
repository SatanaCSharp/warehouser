import type { DemandLine } from '@warehouser/contracts/customer-orders';

/**
 * Whether one Demand Line answers the destination's search term (design frame
 * `G6jhw`, placeholder `Search items or SKUs`).
 *
 * The filter is **client-side over the demand the route already loaded**, not a
 * server query: `spec.md` §1 fixes the scale at roughly 2 000 Items per
 * Warehouse and states that the demand list is "returned whole rather than in
 * pages", and `design-handoff.md` §Open questions keeps paging as the trigger
 * for outgrowing that scale rather than something this release introduces. So
 * the whole collection is already in the client, a second request would return
 * exactly what is already there, and searching it costs one pass.
 *
 * An empty term matches everything, so a blank field is not a filter.
 */
export const matchesDemandQuery = (
  query: string,
): ((line: DemandLine) => boolean) => {
  const needle = query.trim().toLocaleLowerCase();

  return (line) =>
    needle === '' ||
    `${line.sku} ${line.description}`.toLocaleLowerCase().includes(needle);
};
