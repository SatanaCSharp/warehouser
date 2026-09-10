import { randomUUID } from 'node:crypto';

import {
  type InitialAccessProjection,
  ProvisionInitialAccessCommand,
} from 'access/usecases/commands/provision-initial-access.command';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
import { AccessName } from 'shared/domain/value-objects/access-name';

// spec.md §1 (second paragraph): the full initial Workspace Owner Workspace
// Permission set, granted to the protected Workspace Owner Role at
// registration. `WORKSPACE_OWNER_ROLE:REASSIGN` is reserved to that Role and
// is never assignable to a custom Workspace Role.
const INITIAL_WORKSPACE_OWNER_PERMISSION_IDS = [
  'WORKSPACE:RENAME',
  'WORKSPACE_ROLES:WATCH',
  'WORKSPACE_ROLES:CREATE',
  'WORKSPACE_ROLES:UPDATE',
  'WORKSPACE_ROLES:DELETE',
  'WORKSPACE_ROLES:ASSIGN',
  'WORKSPACE_MEMBERS:WATCH',
  'WORKSPACE_MEMBERS:ADD',
  'WORKSPACE_MEMBERS:REMOVE',
  'WAREHOUSES:WATCH',
  'WAREHOUSES:CREATE',
  'WAREHOUSES:RENAME',
  'WAREHOUSES:ARCHIVE',
  'WAREHOUSE_MEMBERSHIPS:ASSIGN',
  'WAREHOUSE_MEMBERSHIPS:REVOKE',
  'WORKSPACE_OWNER_ROLE:REASSIGN',
] as const;

export interface ProvisionRegistrationInput {
  readonly userId: string;
  readonly workspaceId: string;
  readonly warehouseName: string;
}

export interface WorkspaceProjection {
  readonly id: string;
  readonly name: string | null;
}

export interface ProvisionRegistrationResult {
  readonly workspace: WorkspaceProjection;
  // Narrowed from `string[]` to the vocabulary itself, so the registration
  // response can be typed by the contract: a widened element type would let
  // an id outside the catalogue reach `RegistrationResult` (AC-01, AC-18).
  readonly workspacePermissionIds: readonly (typeof INITIAL_WORKSPACE_OWNER_PERMISSION_IDS)[number][];
  readonly access: InitialAccessProjection;
}

// sad.md §6.1: registration bootstrap is one orchestration inside
// `RegisterCommand`'s existing transaction. This service creates the
// unnamed Workspace, its protected Workspace Owner Role with the initial
// Workspace Permission set, and the registrant's Workspace membership, then
// creates the first Warehouse and delegates that Warehouse's protected
// Manager Role and membership to `access`'s exported provisioning command by
// passing only a `warehouseId` and a `userId` — `access` learns nothing
// about Workspaces. No `@Transactional()` boundary here: propagation keeps
// every write inside the transaction the caller (`RegisterCommand`) already
// owns (sad.md §4).
export class WorkspaceProvisioningService {
  constructor(
    private readonly workspaceProvisioningRepository: WorkspaceProvisioningRepository,
    private readonly provisionInitialAccess: ProvisionInitialAccessCommand,
  ) {}

  async provisionRegistration(
    input: ProvisionRegistrationInput,
  ): Promise<ProvisionRegistrationResult> {
    const ownerRoleId = randomUUID();
    const warehouseId = randomUUID();

    await this.workspaceProvisioningRepository.provisionWorkspace({
      workspace: { id: input.workspaceId, name: null },
      ownerRole: {
        id: ownerRoleId,
        workspaceId: input.workspaceId,
        name: 'Workspace Owner',
        kind: 'workspace_owner',
      },
      ownerMembership: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        workspaceRoleId: ownerRoleId,
        workspaceRoleKind: 'workspace_owner',
      },
      permissionIds: INITIAL_WORKSPACE_OWNER_PERMISSION_IDS,
    });

    await this.workspaceProvisioningRepository.provisionWarehouse({
      id: warehouseId,
      workspaceId: input.workspaceId,
      name: AccessName.create(input.warehouseName).value,
    });

    const access = await this.provisionInitialAccess.execute({
      warehouseId,
      userId: input.userId,
    });

    return {
      workspace: { id: input.workspaceId, name: null },
      workspacePermissionIds: INITIAL_WORKSPACE_OWNER_PERMISSION_IDS,
      access,
    };
  }
}
