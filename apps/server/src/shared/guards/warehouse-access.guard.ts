import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionId } from '@warehouser/shared-types/enums';
import { accessCurrentUser } from 'shared/access/access-current-user';
import {
  accessDeniedError,
  warehouseArchivedError,
} from 'shared/access/access-denial.errors';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator';
import { OBSERVED_PERMISSION_KEY } from 'shared/decorators/observed-permission.decorator';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';

/** Reads the single Warehouse identifier the request unambiguously names. The route's
 * `warehouseId` param is authoritative; a body-supplied `warehouseId` that disagrees with it makes
 * the request as ambiguous as naming no Warehouse at all, and both are refused before anything is
 * resolved from the store (AC-03a). */
const resolveNamedWarehouseId = (
  request: WarehouseAccessRequest,
): string | undefined => {
  const paramsWarehouseId = request.params?.warehouseId as string | undefined;
  const bodyWarehouseId = request.body?.warehouseId as string | undefined;
  if (bodyWarehouseId !== undefined && bodyWarehouseId !== paramsWarehouseId) {
    return undefined;
  }
  return paramsWarehouseId;
};

/** The one Permission a handler declares as required. `getAllAndOverride` returns `undefined` for an
 * undecorated handler and an empty array is the same absence, so both collapse here and are refused
 * by the single admission check in `canActivate`. */
const firstRequiredPermission = (
  permissionIds: PermissionId[] | undefined,
): PermissionId | undefined => permissionIds?.[0];

/** `@ObservedPermission` is optional, so an undecorated handler reads back as `undefined`; an empty
 * declaration is the same thing and the repository takes the empty list. */
const declaredObservedPermissions = (
  observedPermissionIds: PermissionId[] | undefined,
): PermissionId[] => observedPermissionIds ?? [];

type ResolvedPermission = Awaited<
  ReturnType<AccessCurrentUserRepository['resolveRequiredPermission']>
>;

/** AC-04/AC-05/AC-30 — one denial for every way the membership read can come back short, so a
 * Warehouse the actor is not a member of is indistinguishable from one whose Role lacks the
 * Permission. */
const grantedMembership = (
  current: ResolvedPermission,
): NonNullable<ResolvedPermission> => {
  if (!current?.granted) {
    throw accessDeniedError();
  }
  return current;
};

/** AC-12/AC-12a — an archived Warehouse refuses every handler that has not declared itself tolerant
 * of the archive. */
const assertArchiveTolerated = (
  archived: boolean,
  readTolerant: boolean | undefined,
): void => {
  if (archived && !readTolerant) {
    throw warehouseArchivedError();
  }
};

@Injectable()
export class WarehouseAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly currentUsers: AccessCurrentUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WarehouseAccessRequest>();
    const declaredOn = [context.getHandler(), context.getClass()];
    // `getAllAndOverride` is typed to return `TResult`, but returns `undefined` when no target
    // carries the metadata key — an undecorated handler. The `| undefined` restores that case to
    // the type so the checks below stay real checks rather than dead code.
    const permissionId = firstRequiredPermission(
      this.reflector.getAllAndOverride<PermissionId[] | undefined>(
        REQUIRED_PERMISSION_KEY,
        declaredOn,
      ),
    );
    // Read only, never enforced: `@ObservedPermission` declares Permissions the projection wants
    // resolved. Nothing below consults the resolved set to decide admission, so a handler that
    // declares only observed Permissions is denied by the very next condition, exactly as an
    // undecorated handler is (AC-09a, ADR 0001).
    const observedPermissionIds = declaredObservedPermissions(
      this.reflector.getAllAndOverride<PermissionId[] | undefined>(
        OBSERVED_PERMISSION_KEY,
        declaredOn,
      ),
    );
    const warehouseId = resolveNamedWarehouseId(request);
    if (!request.user || !permissionId || !warehouseId) {
      throw accessDeniedError();
    }

    const current = grantedMembership(
      await this.currentUsers.resolveRequiredPermission(
        request.user.userId,
        warehouseId,
        permissionId,
        observedPermissionIds,
      ),
    );

    const archived = current.archivedAt !== null;
    assertArchiveTolerated(
      archived,
      this.reflector.getAllAndOverride<boolean | undefined>(
        READ_TOLERANT_KEY,
        declaredOn,
      ),
    );

    request.access = accessCurrentUser({
      userId: current.userId,
      warehouseId,
      roleId: current.roleId,
      roleKind: current.roleKind,
      permissionId: current.permissionId as PermissionId,
      observedPermissionIds:
        current.observedPermissionIds as readonly PermissionId[],
      archived,
    });
    return true;
  }
}
