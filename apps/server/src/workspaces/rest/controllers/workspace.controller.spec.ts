import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceAccessRequest } from 'shared/access/access-request.js';
import { REQUIRED_WORKSPACE_PERMISSION_KEY } from 'shared/decorators/required-workspace-permission.decorator.js';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceController } from 'workspaces/rest/controllers/workspace.controller.js';
import type { RenameWorkspaceCommand } from 'workspaces/usecases/commands/rename-workspace.command.js';
import type { SetActiveWarehouseCommand } from 'workspaces/usecases/commands/set-active-warehouse.command.js';
import type { ReadWorkspaceContextQuery } from 'workspaces/usecases/queries/read-workspace-context.query.js';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const actorId = id(1);
const workspaceId = id(2);
const roleId = id(3);

const request = (
  permissionId: WorkspacePermissionId,
): WorkspaceAccessRequest => ({
  headers: {},
  user: { userId: actorId },
  workspace: {
    userId: actorId,
    workspaceId,
    workspaceRoleId: roleId,
    workspaceRoleKind: 'custom',
    permissionId,
  },
});

const sessionOnlyRequest = (): WorkspaceAccessRequest => ({
  headers: {},
  user: { userId: actorId },
});

const method = (name: keyof WorkspaceController): object =>
  Object.getOwnPropertyDescriptor(WorkspaceController.prototype, name)
    ?.value as object;

// The three handlers whose subject is the Workspace record and the member's own
// context. The roles, members, permissions, users and owner-transfer half of
// this suite moved with its handlers to
// `access/rest/controllers/workspace-access.controller.spec.ts` (CH-S2); every
// assertion below is unchanged, only the inventories this file enumerates
// shrank to the handlers that stayed (CR-RG-01).
describe('WorkspaceController', () => {
  const context = {
    execute: vi.fn(),
  } as unknown as ReadWorkspaceContextQuery;
  const rename = { execute: vi.fn() } as unknown as RenameWorkspaceCommand;
  const setActiveWarehouse = {
    execute: vi.fn(),
  } as unknown as SetActiveWarehouseCommand;

  const controller = new WorkspaceController(
    context,
    rename,
    setActiveWarehouse,
  );

  beforeEach(() => vi.clearAllMocks());

  it('exposes every Workspace-scoped path of openapi.yaml under one prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, WorkspaceController)).toBe(
      'api/v1/workspace',
    );
    expect([
      [
        Reflect.getMetadata(PATH_METADATA, method('readContext')),
        Reflect.getMetadata(METHOD_METADATA, method('readContext')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('setActiveWarehouse')),
        Reflect.getMetadata(METHOD_METADATA, method('setActiveWarehouse')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('renameWorkspace')),
        Reflect.getMetadata(METHOD_METADATA, method('renameWorkspace')),
      ],
    ]).toEqual([
      ['context', RequestMethod.GET],
      ['active-warehouse', RequestMethod.PUT],
      ['/', RequestMethod.PATCH],
    ]);
  });

  // sad.md §8 class 5 — the self-projection read, and class 4 — the single
  // session-only-with-a-documented-membership-check route.
  it.each(['readContext', 'setActiveWarehouse'] as const)(
    '%s is session-only and declares no Workspace Permission',
    (name) => {
      expect(
        Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSION_KEY, method(name)),
      ).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, method(name))).toEqual([
        SessionAuthGuard,
      ]);
    },
  );

  // AC-30 — the empty projection a User who is no Workspace Member at all
  // receives is what makes the web omit every Workspace control.
  it('answers the actor context for a User who is no Workspace Member', async () => {
    vi.mocked(context.execute).mockResolvedValue({
      workspace: { id: workspaceId, name: 'Test Workspace' },
      workspacePermissionIds: [],
      warehouses: [
        {
          warehouseId: id(10),
          name: 'Test Warehouse North',
          archivedAt: null,
          roleId: id(20),
          roleKind: 'custom',
        },
      ],
      effectiveWarehouseId: id(10),
    });

    await expect(controller.readContext(sessionOnlyRequest())).resolves.toEqual(
      {
        workspace: { id: workspaceId, name: 'Test Workspace' },
        workspacePermissionIds: [],
        warehouses: [
          {
            warehouseId: id(10),
            name: 'Test Warehouse North',
            archivedAt: null,
            roleId: id(20),
            roleKind: 'custom',
          },
        ],
        effectiveWarehouseId: id(10),
      },
    );
    expect(context.execute).toHaveBeenCalledWith(actorId);
  });

  it('renders the archived state of a context Warehouse as a contract timestamp', async () => {
    vi.mocked(context.execute).mockResolvedValue({
      workspace: { id: workspaceId, name: null },
      workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
      warehouses: [
        {
          warehouseId: id(11),
          name: 'Test Warehouse South',
          archivedAt: new Date('2026-08-01T09:00:00.000Z'),
          roleId: id(21),
          roleKind: 'custom',
        },
      ],
      effectiveWarehouseId: null,
    });

    await expect(
      controller.readContext(sessionOnlyRequest()),
    ).resolves.toMatchObject({
      warehouses: [
        expect.objectContaining({ archivedAt: '2026-08-01T09:00:00.000Z' }),
      ],
    });
  });

  it('delegates the selection to the command that proves the membership', async () => {
    vi.mocked(setActiveWarehouse.execute).mockResolvedValue({
      effectiveWarehouseId: id(10),
    });

    await expect(
      controller.setActiveWarehouse(sessionOnlyRequest(), {
        warehouseId: id(10),
      }),
    ).resolves.toEqual({ effectiveWarehouseId: id(10) });
    expect(setActiveWarehouse.execute).toHaveBeenCalledWith(actorId, {
      warehouseId: id(10),
    });
  });

  it('delegates the Workspace rename and returns the renamed Workspace', async () => {
    vi.mocked(rename.execute).mockResolvedValue({
      id: workspaceId,
      name: 'Test Workspace',
    });

    await expect(
      controller.renameWorkspace(
        request(WorkspacePermissionId.WORKSPACE_RENAME),
        { name: 'Test Workspace' },
      ),
    ).resolves.toEqual({ id: workspaceId, name: 'Test Workspace' });
    expect(rename.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { name: 'Test Workspace' },
    );
  });

  // DoD — no controller on this surface contains business logic: it reaches
  // only use cases, never a repository, a domain service or persistence.
  it('reaches use cases only, never a repository, service or persistence', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'workspace.controller.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/from\s+['"]shared\/domain\/repositories\//u);
    expect(source).not.toMatch(/from\s+['"]shared\/domain\/entities\//u);
    expect(source).not.toMatch(/from\s+['"]workspaces\/domain\//u);
    expect(source).not.toMatch(/from\s+['"]typeorm['"]/u);
    expect(source).not.toMatch(/\btry\s*\{/u);
  });
});
