import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { REQUIRED_WORKSPACE_PERMISSION_KEY } from 'shared/decorators/required-workspace-permission.decorator';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import { repositoryDouble } from 'test/doubles/repository-double';

// ADR 0001 / sad §6.2: a User belongs to exactly one Workspace and never selects it, so a
// Workspace-scoped route carries no Workspace identifier and this guard derives it entirely from the
// session. It composes after SessionAuthGuard, reads its own metadata key
// (@RequiredWorkspacePermission), resolves fresh Workspace authority on every decision, denies
// missing authority, and attaches a frozen WorkspaceCurrentUser. It decides no target ownership
// (AC-30, AC-31, DoD "own metadata key" / "safe principal" / "no target ownership").

const userId = '00000000-0000-4000-8000-000000000010';
const workspaceId = '00000000-0000-4000-8000-000000000011';
const workspaceRoleId = '00000000-0000-4000-8000-000000000012';
const permissionId = 'WORKSPACE:RENAME';

// A metadata key a WarehouseAccessGuard-shaped decorator would use; this guard must never resolve
// authority from it (AC-31 runtime half, DoD "own metadata key").
const REQUIRED_PERMISSION_KEY = 'access.required-permission';

const contextFor = (request: Record<string, unknown>): ExecutionContext =>
  ({
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const reflectorReturning = (key: string, value: unknown): Reflector =>
  ({
    getAllAndOverride: jest.fn((requestedKey: string) =>
      requestedKey === key ? value : undefined,
    ),
  }) as unknown as Reflector;

/** A request whose `user.activeWarehouseId` throws if ever read, proving this guard — which decides
 * nothing about Warehouses — never touches the stored Active Warehouse selection either. */
const requestWithGuardedSelection = (
  overrides: Record<string, unknown>,
): Record<string, unknown> => ({
  user: new Proxy(
    { userId },
    {
      get(target, property, receiver) {
        if (property === 'activeWarehouseId') {
          throw new Error(
            'WorkspaceAccessGuard must never read the stored Active Warehouse selection',
          );
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    },
  ),
  ...overrides,
});

const guardWith = (
  reflector: Reflector,
  resolveRequiredWorkspacePermission: jest.Mock,
): WorkspaceAccessGuard =>
  new WorkspaceAccessGuard(
    reflector,
    repositoryDouble<WorkspaceCurrentUserRepository>()({
      resolveRequiredWorkspacePermission,
    }),
  );

describe('WorkspaceAccessGuard', () => {
  const grantedResult = {
    userId,
    workspaceId,
    workspaceRoleId,
    workspaceRoleKind: 'custom' as const,
    permissionId,
    granted: true,
  };

  describe('session composition, own metadata key and a safe principal', () => {
    it('resolves the actor’s Workspace authority from the session alone and attaches a frozen principal with no client-supplied value', async () => {
      const resolveRequiredWorkspacePermission = jest
        .fn()
        .mockResolvedValue(grantedResult);
      const reflector = reflectorReturning(REQUIRED_WORKSPACE_PERMISSION_KEY, [
        permissionId,
      ]);
      const guard = guardWith(reflector, resolveRequiredWorkspacePermission);
      // No Workspace identifier anywhere on the request — the guard must derive it from the session.
      const request = requestWithGuardedSelection({});

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      expect(resolveRequiredWorkspacePermission).toHaveBeenCalledWith(
        userId,
        permissionId,
      );
      expect(Object.isFrozen(request.workspace)).toBe(true);
      expect(request.workspace).toEqual({
        userId,
        workspaceId,
        workspaceRoleId,
        workspaceRoleKind: 'custom',
        permissionId,
      });
      expect(Object.keys(request.workspace as object).sort()).toEqual(
        [
          'permissionId',
          'userId',
          'workspaceId',
          'workspaceRoleId',
          'workspaceRoleKind',
        ].sort(),
      );
    });

    it('reads only its own required-workspace-permission metadata key, never the Warehouse guard key', async () => {
      const resolveRequiredWorkspacePermission = jest
        .fn()
        .mockResolvedValue(grantedResult);
      const reflector = reflectorReturning(REQUIRED_PERMISSION_KEY, [
        'ROLES:WATCH',
      ]);
      const guard = guardWith(reflector, resolveRequiredWorkspacePermission);
      const request = requestWithGuardedSelection({});

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.WORKSPACE_DENIED,
        }),
      );
      expect(resolveRequiredWorkspacePermission).not.toHaveBeenCalled();
      expect(request).not.toHaveProperty('workspace');
    });
  });

  describe('missing Workspace membership or Permission denies', () => {
    it('denies when the actor holds no Workspace membership', async () => {
      const resolveRequiredWorkspacePermission = jest
        .fn()
        .mockResolvedValue(null);
      const reflector = reflectorReturning(REQUIRED_WORKSPACE_PERMISSION_KEY, [
        permissionId,
      ]);
      const guard = guardWith(reflector, resolveRequiredWorkspacePermission);
      const request = requestWithGuardedSelection({});

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.WORKSPACE_DENIED,
        }),
      );
      expect(request).not.toHaveProperty('workspace');
    });

    it('denies when the Workspace Role does not carry the declared Workspace Permission', async () => {
      const resolveRequiredWorkspacePermission = jest
        .fn()
        .mockResolvedValue({ ...grantedResult, granted: false });
      const reflector = reflectorReturning(REQUIRED_WORKSPACE_PERMISSION_KEY, [
        permissionId,
      ]);
      const guard = guardWith(reflector, resolveRequiredWorkspacePermission);
      const request = requestWithGuardedSelection({});

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.WORKSPACE_DENIED,
        }),
      );
      expect(request).not.toHaveProperty('workspace');
    });
  });

  describe('AC-31 (runtime half) — a Warehouse Permission declared here resolves nothing', () => {
    it('denies and never calls the repository when no Workspace Permission is declared on the handler', async () => {
      const resolveRequiredWorkspacePermission = jest
        .fn()
        .mockResolvedValue(grantedResult);
      const reflector = reflectorReturning(
        REQUIRED_WORKSPACE_PERMISSION_KEY,
        undefined,
      );
      const guard = guardWith(reflector, resolveRequiredWorkspacePermission);
      const request = requestWithGuardedSelection({});

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.WORKSPACE_DENIED,
        }),
      );
      expect(resolveRequiredWorkspacePermission).not.toHaveBeenCalled();
    });
  });

  describe('AC-30 — a denial is indistinguishable from a missing target', () => {
    it('produces the identical denial shape for no membership and for insufficient Permission', async () => {
      const reflector = reflectorReturning(REQUIRED_WORKSPACE_PERMISSION_KEY, [
        permissionId,
      ]);

      const guardForNoMembership = guardWith(
        reflector,
        jest.fn().mockResolvedValue(null),
      );
      let noMembershipError: ApplicationError | undefined;
      try {
        await guardForNoMembership.canActivate(
          contextFor(requestWithGuardedSelection({})),
        );
      } catch (error) {
        noMembershipError = error as ApplicationError;
      }

      const guardForInsufficientPermission = guardWith(
        reflector,
        jest.fn().mockResolvedValue({ ...grantedResult, granted: false }),
      );
      let insufficientPermissionError: ApplicationError | undefined;
      try {
        await guardForInsufficientPermission.canActivate(
          contextFor(requestWithGuardedSelection({})),
        );
      } catch (error) {
        insufficientPermissionError = error as ApplicationError;
      }

      expect(noMembershipError).toBeInstanceOf(ApplicationError);
      expect(insufficientPermissionError).toBeInstanceOf(ApplicationError);
      expect(noMembershipError?.code).toBe(insufficientPermissionError?.code);
      expect(noMembershipError?.details).toEqual(
        insufficientPermissionError?.details,
      );
    });
  });

  describe('decides no target ownership', () => {
    it('never reads or requires any route- or body-supplied target identifier', async () => {
      const resolveRequiredWorkspacePermission = jest
        .fn()
        .mockResolvedValue(grantedResult);
      const reflector = reflectorReturning(REQUIRED_WORKSPACE_PERMISSION_KEY, [
        permissionId,
      ]);
      const guard = guardWith(reflector, resolveRequiredWorkspacePermission);
      // params/body carry an unrelated foreign identifier the guard must ignore entirely: it
      // authorizes from the session, and ownership of any target is proven by the use case, not here.
      const request = requestWithGuardedSelection({
        params: { workspaceRoleId: 'foreign-role' },
        body: { warehouseId: 'foreign-warehouse' },
      });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(resolveRequiredWorkspacePermission).toHaveBeenCalledWith(
        userId,
        permissionId,
      );
    });
  });
});
