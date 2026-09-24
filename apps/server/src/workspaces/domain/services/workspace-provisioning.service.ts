import { randomUUID } from 'node:crypto';

import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { InitialAccessProjection } from 'access/usecases/commands/provision-initial-access.command';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
import { AccessName } from 'shared/domain/value-objects/access-name';

// spec.md §1 (second paragraph): the full initial Workspace Owner Workspace Permission set, granted
// to the protected Workspace Owner Role at registration. The Owner holds the catalogue entire —
// `WORKSPACE_OWNER_ROLE:REASSIGN` included, which is reserved *to* this Role rather than withheld
// from it and is what keeps it off every custom Workspace Role (AC-18) — so the set is derived from
// `WorkspacePermissionId` rather than restated, exactly as `MANAGER_PERMISSION_IDS` derives the
// Warehouse Manager's set in `access/domain/services/manager-permission-catalogue.service.ts`.
//
// A hand-written copy rotted twice, each time silently: a migration extends the catalogue and
// backfills the `workspace_owner` Roles that already exist, and the list that provisions the *next*
// Workspace is a separate edit nothing forces. `WAREHOUSES:ADDRESS_UPDATE`
// (`migrations/1786700200000-GrantDeliveryAddressPermissions.ts`, `delivery-addresses` AC-10) and
// then `WAREHOUSE_PERFORMANCE:WATCH` (`migrations/1786900100000-GrantDashboardPermissions.ts`,
// `dashboards` AC-21/AC-21a) were both seeded and backfilled without it, so Owners of Workspaces
// registered afterwards could neither record a Warehouse delivery address nor open their own
// Workspace Dashboard while every earlier Owner could. Deriving removes the second edit.
//
// A Permission the Workspace Owner must NOT hold goes here, and only here; nothing else about this
// file changes when the catalogue grows.
const WORKSPACE_OWNER_EXCLUDED_PERMISSION_IDS: readonly WorkspacePermissionId[] =
  [];

const INITIAL_WORKSPACE_OWNER_PERMISSION_IDS: readonly WorkspacePermissionId[] =
  Object.values(WorkspacePermissionId).filter(
    (permissionId) =>
      !WORKSPACE_OWNER_EXCLUDED_PERMISSION_IDS.includes(permissionId),
  );

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
  // `WorkspacePermissionId` *is* that vocabulary — `registrationResultSchema`'s
  // `workspacePermissionIds` is `z.array(workspacePermissionIdSchema)`, built from the same
  // constant — so naming it directly is what the derivation above reads off, no narrower and no
  // wider than the set it returns.
  readonly workspacePermissionIds: readonly WorkspacePermissionId[];
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
