import { SetMetadata } from '@nestjs/common';
import type { PermissionId } from '@warehouser/shared-types/enums';

/** The metadata key `WarehouseAccessGuard` reads to learn which Permissions a handler *observes*.
 * It is deliberately a key of its own, distinct from `REQUIRED_PERMISSION_KEY`, so an observed
 * declaration can never be mistaken for a required one by either the guard or a reader. */
export const OBSERVED_PERMISSION_KEY = 'access.observed-permission';

/** Declares Permissions a handler wants *resolved* but never *required* (AC-09a, ADR 0001).
 *
 * The guard resolves these in the same membership read it already performs for the handler's
 * `@RequiredPermission` and attaches the granted subset to the principal as
 * `observedPermissionIds`, which a query consults to decide what its projection may carry.
 *
 * An observed Permission carries **no denial power by construction**: `canActivate` never consults
 * the resolved set, so an ungranted observed Permission cannot deny, and a granted one cannot
 * admit. A handler declaring only observed Permissions and no `@RequiredPermission` is denied
 * exactly as an undecorated handler is. The worst a mistake here can produce is a surface that
 * withholds data from someone entitled to it, or a command that wrongly refuses a write someone was
 * entitled to make — never a disclosure or an admission the required Permission alone did not
 * already grant (server-request-authorization.md § "Why an observed Permission cannot deny"). */
export const ObservedPermission = (...permissionIds: PermissionId[]) =>
  SetMetadata(OBSERVED_PERMISSION_KEY, permissionIds);
