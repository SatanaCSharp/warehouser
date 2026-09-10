import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import {
  TRANSACTIONAL_KEY,
  type TransactionalMetadata,
} from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { repositoryDouble } from 'test/doubles/repository-double';
import { describe, expect, it, vi } from 'vitest';
import { SetWarehouseDeliveryAddressCommand } from 'warehouses/usecases/commands/set-warehouse-delivery-address.command';

// T11/AC-10 — the Warehouse's own Delivery Address is recorded and corrected
// in place. The subject of the operation is the Warehouse *record*, so the
// command resolves authority through the Workspace principal and never
// consults archived state (sad.md §4, openapi.yaml `setWarehouseDeliveryAddress`).
// Cross-Workspace denial is proved at integration level, where a real target
// row can be absent or present.

const workspaceId = '00000000-0000-4000-8000-000000000001';
const actorId = '00000000-0000-4000-8000-000000000002';
const warehouseId = '00000000-0000-4000-8000-000000000003';

const currentUser = (): WorkspaceCurrentUser => ({
  userId: actorId,
  workspaceId,
  workspaceRoleId: '00000000-0000-4000-8000-000000000004',
  workspaceRoleKind: 'custom',
  permissionId: WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
});

const warehouseLifecycleRepositoryDouble = () =>
  repositoryDouble<WarehouseLifecycleRepository>()({
    createWarehouse: vi.fn().mockResolvedValue(undefined),
    renameWarehouse: vi.fn().mockResolvedValue(undefined),
    setArchivedAt: vi.fn().mockResolvedValue(undefined),
    setDeliveryAddress: vi.fn().mockResolvedValue(undefined),
    findWarehouse: vi.fn().mockResolvedValue(null),
    lockWorkspaceAndCountNonArchivedWarehouses: vi.fn().mockResolvedValue(1),
    lockWarehouse: vi.fn().mockResolvedValue({
      id: warehouseId,
      workspaceId,
      name: 'Test Warehouse North',
      archivedAt: null,
      deliveryAddressText: null,
      deliveryAccessNotes: null,
    }),
  });

describe('SetWarehouseDeliveryAddressCommand', () => {
  it('AC-10: records the address and its access notes against the Warehouse', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    const command = new SetWarehouseDeliveryAddressCommand(
      warehouseLifecycleRepository,
    );

    const result = await command.execute(currentUser(), {
      warehouseId,
      addressText: '  Test Warehouse North, Test Industrial Estate  ',
      accessNotes: '  Dock 3; report to the gatehouse  ',
    });

    expect(result).toEqual({
      warehouseId,
      addressText: 'Test Warehouse North, Test Industrial Estate',
      accessNotes: 'Dock 3; report to the gatehouse',
    });
    expect(
      warehouseLifecycleRepository.setDeliveryAddress,
    ).toHaveBeenCalledWith(warehouseId, {
      addressText: 'Test Warehouse North, Test Industrial Estate',
      accessNotes: 'Dock 3; report to the gatehouse',
    });
  });

  it.each([
    ['omitted', undefined],
    ['null', null],
    ['blank after trimming', '   '],
  ] as const)(
    'AC-10: records no access notes when they are %s, never an empty string',
    async (_case, accessNotes) => {
      const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
      const command = new SetWarehouseDeliveryAddressCommand(
        warehouseLifecycleRepository,
      );

      const result = await command.execute(currentUser(), {
        warehouseId,
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes,
      });

      expect(result.accessNotes).toBeNull();
    },
  );

  it('AC-10: refuses an address that is empty after trimming, and touches nothing', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    const command = new SetWarehouseDeliveryAddressCommand(
      warehouseLifecycleRepository,
    );

    await expect(
      command.execute(currentUser(), {
        warehouseId,
        addressText: '   ',
        accessNotes: null,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_INVALID_INPUT,
      details: { field: 'addressText', rule: 'trimmed_non_empty' },
    });

    expect(
      warehouseLifecycleRepository.setDeliveryAddress,
    ).not.toHaveBeenCalled();
  });

  it('AC-10: a Warehouse of another Workspace is refused exactly like a missing one', async () => {
    const warehouseLifecycleRepository = warehouseLifecycleRepositoryDouble();
    warehouseLifecycleRepository.lockWarehouse = vi.fn().mockResolvedValue({
      id: warehouseId,
      workspaceId: '00000000-0000-4000-8000-0000000000ff',
      name: 'Test Warehouse North',
      archivedAt: null,
      deliveryAddressText: null,
      deliveryAccessNotes: null,
    });
    const command = new SetWarehouseDeliveryAddressCommand(
      warehouseLifecycleRepository,
    );

    await expect(
      command.execute(currentUser(), {
        warehouseId,
        addressText: 'Test Warehouse North, Test Industrial Estate',
        accessNotes: null,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    });

    expect(
      warehouseLifecycleRepository.setDeliveryAddress,
    ).not.toHaveBeenCalled();
  });

  it('runs inside its own transaction boundary (server-architecture.md: the command owning the complete atomic operation)', () => {
    expect(
      Reflect.getMetadata(
        TRANSACTIONAL_KEY,
        SetWarehouseDeliveryAddressCommand.prototype.execute,
      ) as TransactionalMetadata | undefined,
    ).toBeDefined();
  });
});
