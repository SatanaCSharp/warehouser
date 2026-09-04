import type { CustomerOrderDestination } from '@warehouser/contracts/customers';

/**
 * Why an Unfulfilled Customer Order is going to the address it is going to.
 * `zw3n9`'s `Going to` cell carries the address **and** this, because "where"
 * without "why" leaves a member unable to tell a deliberate redirection from
 * the default.
 */
export type DestinationReason = 'main' | 'inactive' | 'stated';

/**
 * The reasons in precedence order, most significant first
 * (`writing-web-components.md` §6). `inactive` wins over the other two: an
 * address that has since been made Inactive is the one fact a member has to
 * act on, and the order keeps naming it and keeps counting exactly as before
 * (AC-06a). `chk_customer_delivery_addresses_main_is_active` already makes
 * `isMain` and `deactivatedAt` mutually exclusive, so the ordering is
 * defensive rather than load-bearing — but it is stated rather than assumed.
 */
const REASONS: readonly {
  reason: DestinationReason;
  holds: (destination: CustomerOrderDestination) => boolean;
}[] = [
  { reason: 'inactive', holds: ({ deactivatedAt }) => deactivatedAt !== null },
  { reason: 'main', holds: ({ isMain }) => isMain },
];

/**
 * Reads a destination as the reason it is that destination.
 *
 * It declares no hook and renders nothing, so it is filed in the module's
 * `utils/` — a pure function and the lookup table behind it belong there
 * rather than anywhere under `components/` (`placing-web-hooks.md` §3,
 * `frontend-architecture.md` §"Source structure"). The Customer owns the
 * behaviour, so the module keeps it rather than `shared/utils/`.
 */
export const destinationReason = (
  destination: CustomerOrderDestination,
): DestinationReason =>
  REASONS.find(({ holds }) => holds(destination))?.reason ?? 'stated';
