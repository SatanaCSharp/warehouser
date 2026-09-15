import type { ExecutionContext } from '@nestjs/common';
import { isDefined } from '@warehouser/utils/predicates';

/** The questions the authorization stage asks before it admits a request.
 *
 * server-request-authorization.md defines the stage as `SessionAuthGuard` followed by the Warehouse
 * or Workspace level guard, and every one of those guards decides admission from the same handful of
 * facts: does the request carry a principal, did the handler declare the Permission it requires,
 * does the request name exactly one target, and did the membership read come back granted. Each
 * guard used to spell those out inline, which made "what does this guard refuse?" a question you
 * answered by reading three `!`-chained operands rather than a name.
 *
 * Each is a type predicate rather than a plain `boolean`, because the inline checks they replace
 * were narrowing as well as asking: the code after the guard's single admission check reads
 * `request.user.userId` and hands `warehouseId` to a `string` parameter. A `boolean` would move that
 * narrowing back to a non-null assertion at each call site, which is the copy the next caller cannot
 * reuse. */

/** The principal `SessionAuthGuard` attaches once a session resolves. Modelled structurally rather
 * than imported from the guard so this module stays a leaf that guards depend on, not the reverse. */
interface RequestPrincipal {
  readonly userId: string;
}

/** A resolved membership row, as every `resolveRequired*Permission` read returns it: `undefined`
 * when the actor is not a member at all, and a row whose `granted` says whether the Role carries
 * the Permission when they are. */
interface ResolvedMembership {
  readonly granted: boolean;
}

/** Whether a session was resolved for this request.
 *
 * Every guard below `SessionAuthGuard` runs only on an authenticated request, so a missing principal
 * here is a composition mistake rather than an anonymous caller — and it is refused with the same
 * denial as a real one, so the refusal discloses nothing about which of the two happened. */
export const isAuthenticatedPrincipal = <T extends RequestPrincipal>(
  user: T | undefined,
): user is T => isDefined(user);

/** Whether the handler declared the single Permission its guard is to require.
 *
 * `getAllAndOverride` reports an undecorated handler as `undefined`, and a handler that declares
 * only `@ObservedPermission` resolves to the same absence — neither can be admitted, because an
 * observed Permission by construction never admits a request (server-request-authorization.md). */
export const declaresRequiredPermission = <T extends string>(
  permissionId: T | undefined,
): permissionId is T => isDefined(permissionId);

/** Whether the request names exactly one Warehouse.
 *
 * The route parameter is authoritative. A body-supplied `warehouseId` that disagrees with it makes
 * the request as ambiguous as one naming no Warehouse at all (AC-03a), so this asks the route
 * parameter's question and `contradictsRouteWarehouse` asks the body's. */
export const namesOneWarehouse = (
  warehouseId: string | undefined,
): warehouseId is string => isDefined(warehouseId);

/** Whether a body-supplied `warehouseId` contradicts the one the route names.
 *
 * A body that states no Warehouse contradicts nothing — the route parameter stands alone. Only a
 * stated body value that disagrees makes the target ambiguous. */
export const contradictsRouteWarehouse = (
  bodyWarehouseId: string | undefined,
  paramsWarehouseId: string | undefined,
): boolean =>
  isDefined(bodyWarehouseId) && bodyWarehouseId !== paramsWarehouseId;

/** Whether the membership read came back granting the Permission.
 *
 * One answer for every way the read can come back short — no membership row, or a row whose Role
 * lacks the Permission — so a target the actor is not a member of is indistinguishable from one
 * whose Role falls short (AC-04/AC-05/AC-30). */
export const grantsRequiredPermission = <T extends ResolvedMembership>(
  current: T | null | undefined,
): current is T => current?.granted === true;

/** Whether an archived Warehouse refuses this handler.
 *
 * An archived Warehouse admits only a handler that has declared itself tolerant of the archive, and
 * an undeclared handler reads back as `undefined` — the same as declaring intolerance
 * (AC-12/AC-12a). */
export const refusesArchivedWarehouse = (
  archived: boolean,
  readTolerant: boolean | undefined,
): boolean => archived && readTolerant !== true;

/** Whether a guard was handed a NestJS `ExecutionContext` rather than a request it can read
 * directly.
 *
 * `SessionAuthGuard.canActivate` accepts both, so the session check stays usable outside the HTTP
 * pipeline, and `switchToHttp` is the member only the context has. Generic in the request half so
 * this module stays a leaf: it names the framework type it discriminates against and nothing of the
 * guard that asks. */
export const isExecutionContext = <T>(
  context: ExecutionContext | T,
): context is ExecutionContext =>
  isDefined(context) &&
  typeof context === 'object' &&
  'switchToHttp' in context;
