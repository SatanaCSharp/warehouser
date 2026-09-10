import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { OBSERVED_PERMISSION_KEY } from 'shared/decorators/observed-permission.decorator';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import type { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

// This rework covers ADR 0001 / sad §6.3: every Warehouse-scoped request names its Warehouse in the
// route path, the guard resolves the (User, Warehouse) membership and Permission for exactly that
// pair, denies an archived Warehouse unless the handler declares read tolerance, and never
// substitutes the actor's stored selection for a missing route parameter (AC-03a, AC-04, AC-05,
// AC-12, AC-12a, AC-30, AC-31).

const userId = '00000000-0000-4000-8000-000000000001';
const warehouseId = '00000000-0000-4000-8000-000000000002';
const otherWarehouseId = '00000000-0000-4000-8000-000000000009';
const roleId = '00000000-0000-4000-8000-000000000003';
const permissionId = PermissionId.ROLES_WATCH;
const observedPermissionId = PermissionId.CUSTOMERS_WATCH;
const otherObservedPermissionId = PermissionId.ITEMS_WATCH;

// A metadata key a WorkspaceAccessGuard-shaped decorator would use; the value itself is irrelevant —
// only that this guard must never resolve authority from it (AC-31 runtime half, DoD "own metadata
// key").
const REQUIRED_WORKSPACE_PERMISSION_KEY =
  'workspace-access.required-workspace-permission';
const READ_TOLERANT_KEY = 'access.archived-tolerant-read';

const grantedResult = {
  userId,
  warehouseId,
  roleId,
  roleKind: 'custom' as const,
  granted: true,
  permissionId,
  observedPermissionIds: [] as readonly PermissionId[],
  archivedAt: null as Date | null,
};

const contextFor = (request: Record<string, unknown>): ExecutionContext =>
  ({
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

/** A Reflector double that only answers for the exact metadata key it was configured with, so a
 * guard that reads the wrong key observes nothing — proving each guard reads only its own key. */
const reflectorReturning = (key: string, value: unknown): Reflector =>
  ({
    getAllAndOverride: vi.fn((requestedKey: string) =>
      requestedKey === key ? value : undefined,
    ),
  }) as unknown as Reflector;

/** A Reflector double answering two keys at once, for the archived-Warehouse scenarios that must
 * distinguish the declared Permission from the declared read-tolerance. */
const reflectorForArchivedScenario = (readTolerant: boolean): Reflector =>
  ({
    getAllAndOverride: vi.fn((key: string) => {
      if (key === REQUIRED_PERMISSION_KEY) {
        return [permissionId];
      }
      if (key === READ_TOLERANT_KEY) {
        return readTolerant;
      }
      return undefined;
    }),
  }) as unknown as Reflector;

/** Reads the attached principal at its real type, so an assertion about the observed set is
 * checked against `AccessCurrentUser` rather than against `unknown`. */
const principalOf = (request: Record<string, unknown>): AccessCurrentUser =>
  request.access as AccessCurrentUser;

/** A Reflector double answering the full handler declaration — the required Permissions, the
 * observed ones and the read tolerance — so an observed-Permission scenario can state exactly what
 * a handler declared without the guard being able to confuse one key for another (ADR 0001). */
const reflectorForDeclaration = (declaration: {
  required?: readonly PermissionId[];
  observed?: readonly PermissionId[];
  readTolerant?: boolean;
}): Reflector =>
  ({
    getAllAndOverride: vi.fn((key: string) => {
      if (key === REQUIRED_PERMISSION_KEY) {
        return declaration.required;
      }
      if (key === OBSERVED_PERMISSION_KEY) {
        return declaration.observed;
      }
      if (key === READ_TOLERANT_KEY) {
        return declaration.readTolerant;
      }
      return undefined;
    }),
  }) as unknown as Reflector;

/** A request whose `user.activeWarehouseId` throws if ever read, so a guard that consults it — even
 * once, even as a fallback — fails immediately rather than silently passing (AC-03a, "never reads
 * users.active_warehouse_id"). */
const requestWithGuardedSelection = (
  overrides: Record<string, unknown>,
): Record<string, unknown> => ({
  user: new Proxy(
    { userId },
    {
      get(target, property, receiver) {
        if (property === 'activeWarehouseId') {
          throw new Error(
            'WarehouseAccessGuard must never read the stored Active Warehouse selection',
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
  resolveRequiredPermission: Mock,
): WarehouseAccessGuard =>
  new WarehouseAccessGuard(reflector, {
    resolveRequiredPermission,
  } as unknown as AccessCurrentUserRepository);

const describeSessionCompositionAndOwnMetadataKey = (): void => {
  describe('session composition, own metadata key and a safe principal', () => {
    it('resolves the (User, Warehouse) pair named by the route and attaches a frozen principal with no client-supplied value', async () => {
      const resolveRequiredPermission = vi
        .fn()
        .mockResolvedValue(grantedResult);
      const reflector = reflectorReturning(REQUIRED_PERMISSION_KEY, [
        permissionId,
      ]);
      const guard = guardWith(reflector, resolveRequiredPermission);
      const request = requestWithGuardedSelection({
        params: { warehouseId },
      });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      expect(resolveRequiredPermission).toHaveBeenCalledWith(
        userId,
        warehouseId,
        permissionId,
        [],
      );
      expect(Object.isFrozen(request.access)).toBe(true);
      expect(request.access).toEqual({
        userId,
        warehouseId,
        roleId,
        roleKind: 'custom',
        permissionId,
        observedPermissionIds: [],
        archived: false,
      });
      // Nothing beyond the five proven fields, the archived state and the granted observed subset
      // reaches the principal.
      expect(Object.keys(request.access as object).sort()).toEqual(
        [
          'archived',
          'observedPermissionIds',
          'permissionId',
          'roleId',
          'roleKind',
          'userId',
          'warehouseId',
        ].sort(),
      );
    });

    it('reads only its own required-permission metadata key, never the Workspace guard key', async () => {
      const resolveRequiredPermission = vi
        .fn()
        .mockResolvedValue(grantedResult);
      // Only the *other* guard's key resolves to something; this guard's own key resolves to
      // nothing, so it must deny rather than accidentally pick up cross-level metadata.
      const reflector = reflectorReturning(REQUIRED_WORKSPACE_PERMISSION_KEY, [
        'WORKSPACE:RENAME',
      ]);
      const guard = guardWith(reflector, resolveRequiredPermission);
      const request = requestWithGuardedSelection({
        params: { warehouseId },
      });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(resolveRequiredPermission).not.toHaveBeenCalled();
      expect(request).not.toHaveProperty('access');
    });
  });
};

const describeAc03aUnnamedWarehouse = (): void => {
  describe('AC-03a — a request naming no Warehouse is refused, never defaulted', () => {
    it('denies a Warehouse-scoped request with no warehouseId route parameter without consulting the repository', async () => {
      const resolveRequiredPermission = vi
        .fn()
        .mockResolvedValue(grantedResult);
      const reflector = reflectorReturning(REQUIRED_PERMISSION_KEY, [
        permissionId,
      ]);
      const guard = guardWith(reflector, resolveRequiredPermission);
      const request = requestWithGuardedSelection({ params: {} });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(resolveRequiredPermission).not.toHaveBeenCalled();
      expect(request).not.toHaveProperty('access');
    });

    it('denies a request whose path and body name two different Warehouses, as ambiguous as naming none', async () => {
      const resolveRequiredPermission = vi
        .fn()
        .mockResolvedValue(grantedResult);
      const reflector = reflectorReturning(REQUIRED_PERMISSION_KEY, [
        permissionId,
      ]);
      const guard = guardWith(reflector, resolveRequiredPermission);
      const request = requestWithGuardedSelection({
        params: { warehouseId },
        body: { warehouseId: otherWarehouseId },
      });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(resolveRequiredPermission).not.toHaveBeenCalled();
    });
  });
};

const describeAc04NoMembership = (): void => {
  describe('AC-04 — no membership in the named Warehouse', () => {
    it('denies without disclosing the Warehouse and leaves no access data attached', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue(null);
      const reflector = reflectorReturning(REQUIRED_PERMISSION_KEY, [
        permissionId,
      ]);
      const guard = guardWith(reflector, resolveRequiredPermission);
      const request = requestWithGuardedSelection({
        params: { warehouseId },
      });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(request).not.toHaveProperty('access');
    });
  });
};

const describeAc05AuthorityPerWarehouse = (): void => {
  describe('AC-05 — a Permission held only through another Warehouse denies here', () => {
    it('denies when the membership in this Warehouse exists but its Role lacks the declared Permission', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue({
        ...grantedResult,
        granted: false,
      });
      const reflector = reflectorReturning(REQUIRED_PERMISSION_KEY, [
        permissionId,
      ]);
      const guard = guardWith(reflector, resolveRequiredPermission);
      const request = requestWithGuardedSelection({
        params: { warehouseId },
      });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(request).not.toHaveProperty('access');
    });
  });
};

const describeAc12AndAc12aArchivedWarehouse = (): void => {
  describe('AC-12 / AC-12a — archived Warehouse denies mutation, permits declared-tolerant reads', () => {
    it('denies a mutating handler over an archived Warehouse by default', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue({
        ...grantedResult,
        archivedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const guard = guardWith(
        reflectorForArchivedScenario(false),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({
        params: { warehouseId },
      });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_WAREHOUSE_ARCHIVED,
        }),
      );
      expect(request).not.toHaveProperty('access');
    });

    it('allows a handler that explicitly declares read tolerance and marks the principal archived', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue({
        ...grantedResult,
        archivedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const guard = guardWith(
        reflectorForArchivedScenario(true),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({
        params: { warehouseId },
      });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.access).toMatchObject({ archived: true });
    });
  });
};

const describeAc31RuntimeHalf = (): void => {
  describe('AC-31 (runtime half) — a Workspace Permission declared here resolves nothing', () => {
    it('denies and never calls the repository when no Warehouse Permission is declared on the handler', async () => {
      const resolveRequiredPermission = vi
        .fn()
        .mockResolvedValue(grantedResult);
      // Nothing is registered under this guard's own key, simulating a handler that mistakenly
      // declared @RequiredWorkspacePermission instead of @RequiredPermission.
      const reflector = reflectorReturning(REQUIRED_PERMISSION_KEY, undefined);
      const guard = guardWith(reflector, resolveRequiredPermission);
      const request = requestWithGuardedSelection({
        params: { warehouseId },
      });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(resolveRequiredPermission).not.toHaveBeenCalled();
    });
  });
};

const describeAc30IndistinguishableDenial = (): void => {
  describe('AC-30 — a denial is indistinguishable from a missing target', () => {
    it('produces the identical denial shape whether the Warehouse is unnamed or simply not the actor’s', async () => {
      const reflector = reflectorReturning(REQUIRED_PERMISSION_KEY, [
        permissionId,
      ]);

      const guardForUnnamedWarehouse = guardWith(
        reflector,
        vi.fn().mockResolvedValue(grantedResult),
      );
      const unnamedRequest = requestWithGuardedSelection({ params: {} });
      let unnamedError: ApplicationError | undefined;
      try {
        await guardForUnnamedWarehouse.canActivate(contextFor(unnamedRequest));
      } catch (error) {
        unnamedError = error as ApplicationError;
      }

      const guardForNoMembership = guardWith(
        reflector,
        vi.fn().mockResolvedValue(null),
      );
      const noMembershipRequest = requestWithGuardedSelection({
        params: { warehouseId },
      });
      let noMembershipError: ApplicationError | undefined;
      try {
        await guardForNoMembership.canActivate(contextFor(noMembershipRequest));
      } catch (error) {
        noMembershipError = error as ApplicationError;
      }

      expect(unnamedError).toBeInstanceOf(ApplicationError);
      expect(noMembershipError).toBeInstanceOf(ApplicationError);
      expect(unnamedError?.code).toBe(noMembershipError?.code);
      expect(unnamedError?.details).toEqual(noMembershipError?.details);
    });
  });
};

/** AC-09a / ADR 0001: an observed Permission is resolved in the same membership read as the
 * required one and carried on the principal, and it can only ever narrow a projection — it never
 * admits and never denies. */
const describeAc09aObservedPermissions = (): void => {
  describe('AC-09a — an observed Permission annotates the principal and never decides admission', () => {
    it('resolves the observed Permissions in the same membership read as the required one', async () => {
      const resolveRequiredPermission = vi
        .fn()
        .mockResolvedValue(grantedResult);
      const guard = guardWith(
        reflectorForDeclaration({
          required: [permissionId],
          observed: [observedPermissionId],
        }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({ params: { warehouseId } });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      expect(resolveRequiredPermission).toHaveBeenCalledTimes(1);
      expect(resolveRequiredPermission).toHaveBeenCalledWith(
        userId,
        warehouseId,
        permissionId,
        [observedPermissionId],
      );
    });

    it('admits the request and leaves the principal without an observed Permission that is not granted', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue({
        ...grantedResult,
        observedPermissionIds: [],
      });
      const guard = guardWith(
        reflectorForDeclaration({
          required: [permissionId],
          observed: [observedPermissionId],
        }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({ params: { warehouseId } });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.access).toMatchObject({ observedPermissionIds: [] });
    });

    it('carries exactly the granted subset of what the handler declared, and nothing else', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue({
        ...grantedResult,
        observedPermissionIds: [observedPermissionId],
      });
      const guard = guardWith(
        reflectorForDeclaration({
          required: [permissionId],
          observed: [observedPermissionId, otherObservedPermissionId],
        }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({ params: { warehouseId } });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(principalOf(request).observedPermissionIds).toEqual([
        observedPermissionId,
      ]);
      expect(principalOf(request).observedPermissionIds).not.toContain(
        otherObservedPermissionId,
      );
      // The principal is a frozen server-side value: the observed set cannot be widened after the
      // guard resolved it.
      expect(Object.isFrozen(request.access)).toBe(true);
      expect(Object.isFrozen(principalOf(request).observedPermissionIds)).toBe(
        true,
      );
    });

    it('leaves the observed set empty when the handler declares none', async () => {
      const resolveRequiredPermission = vi
        .fn()
        .mockResolvedValue(grantedResult);
      const guard = guardWith(
        reflectorForDeclaration({ required: [permissionId] }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({ params: { warehouseId } });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(resolveRequiredPermission).toHaveBeenCalledWith(
        userId,
        warehouseId,
        permissionId,
        [],
      );
      expect(principalOf(request).observedPermissionIds).toEqual([]);
    });
  });
};

/** AC-09a / ADR 0001, the direction a mistake would be dangerous in: an observed Permission must
 * never widen access. Nothing below may pass because a Permission was observed rather than
 * required. */
const describeAc09aObservedPermissionsNeverAdmit = (): void => {
  describe('AC-09a — an observed Permission never admits a request the required one would refuse', () => {
    it('still denies when the required Permission is not granted, however many observed ones are', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue({
        ...grantedResult,
        granted: false,
        observedPermissionIds: [observedPermissionId],
      });
      const guard = guardWith(
        reflectorForDeclaration({
          required: [permissionId],
          observed: [observedPermissionId],
        }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({ params: { warehouseId } });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(request).not.toHaveProperty('access');
    });

    it('never lets the same Permission observed on a handler substitute for the required grant', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue({
        ...grantedResult,
        granted: false,
        observedPermissionIds: [permissionId],
      });
      const guard = guardWith(
        reflectorForDeclaration({
          required: [permissionId],
          observed: [permissionId],
        }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({ params: { warehouseId } });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(request).not.toHaveProperty('access');
    });

    it('denies a handler that declares only observed Permissions and no required one, resolving nothing', async () => {
      const resolveRequiredPermission = vi
        .fn()
        .mockResolvedValue(grantedResult);
      const guard = guardWith(
        reflectorForDeclaration({ observed: [observedPermissionId] }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({ params: { warehouseId } });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(resolveRequiredPermission).not.toHaveBeenCalled();
      expect(request).not.toHaveProperty('access');
    });

    it('refuses an ambiguous warehouseId exactly as before, resolving nothing, observed or otherwise', async () => {
      const resolveRequiredPermission = vi
        .fn()
        .mockResolvedValue(grantedResult);
      const guard = guardWith(
        reflectorForDeclaration({
          required: [permissionId],
          observed: [observedPermissionId],
        }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({
        params: { warehouseId },
        body: { warehouseId: otherWarehouseId },
      });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
      expect(resolveRequiredPermission).not.toHaveBeenCalled();
    });

    it('keeps archived handling unchanged: an archived Warehouse still refuses a handler that is not read-tolerant', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue({
        ...grantedResult,
        observedPermissionIds: [observedPermissionId],
        archivedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const guard = guardWith(
        reflectorForDeclaration({
          required: [permissionId],
          observed: [observedPermissionId],
          readTolerant: false,
        }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({ params: { warehouseId } });

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<Partial<ApplicationError>>({
          code: ErrorCode.ACCESS_WAREHOUSE_ARCHIVED,
        }),
      );
      expect(request).not.toHaveProperty('access');
    });

    it('keeps archived handling unchanged: a read-tolerant handler is served and still carries its observed set', async () => {
      const resolveRequiredPermission = vi.fn().mockResolvedValue({
        ...grantedResult,
        observedPermissionIds: [observedPermissionId],
        archivedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const guard = guardWith(
        reflectorForDeclaration({
          required: [permissionId],
          observed: [observedPermissionId],
          readTolerant: true,
        }),
        resolveRequiredPermission,
      );
      const request = requestWithGuardedSelection({ params: { warehouseId } });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.access).toMatchObject({
        archived: true,
        observedPermissionIds: [observedPermissionId],
      });
    });
  });
};

describe('WarehouseAccessGuard', () => {
  describeSessionCompositionAndOwnMetadataKey();
  describeAc03aUnnamedWarehouse();
  describeAc04NoMembership();
  describeAc05AuthorityPerWarehouse();
  describeAc12AndAc12aArchivedWarehouse();
  describeAc31RuntimeHalf();
  describeAc30IndistinguishableDenial();
  describeAc09aObservedPermissions();
  describeAc09aObservedPermissionsNeverAdmit();
});
