import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import type { WorkspaceProvisioningInput } from 'shared/domain/repositories/workspace-provisioning.repository';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
import { describe, expect, it } from 'vitest';
import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service';

// The regression behind this file: the initial Workspace Owner Permission set used to be written out
// by hand, while the catalogue it has to match is extended by migrations. `WAREHOUSES:ADDRESS_UPDATE`
// (`delivery-addresses` AC-10) and then `WAREHOUSE_PERFORMANCE:WATCH` (`dashboards` AC-21/AC-21a)
// were each seeded and backfilled onto the `workspace_owner` Roles that already existed without
// reaching that list, so Owners of Workspaces registered afterwards were denied capabilities every
// earlier Owner held — the second one answered `403 workspace.denied` on all four Workspace
// Dashboard Panels for the Owner.
//
// **The whole-catalogue property is not asserted here.** "Every Permission the migrations seeded"
// is a fact about the database, and `workspace_permissions` is where it lives; at this tier the only
// available stand-in is `Object.values(WorkspacePermissionId)`, which is the expression the
// production derivation itself evaluates — a test shaped that way restates the code instead of
// checking it. It lives in the integration tier instead, reading both sides from the migrated
// template:
// `auth/usecases/commands/register-access.integration.spec.ts` § "grants the newly provisioned
// Workspace Owner Role every Permission the migrations seeded".
//
// What is left for this tier is what the derivation cannot state about itself.
const setup = () => {
  // What `provisionWorkspace` was handed — the grant actually written to
  // `workspace_role_permissions` — kept separately from the projection the result reports.
  const granted: { permissionIds: readonly string[] } = { permissionIds: [] };

  const repository = {
    provisionWorkspace(provisioning: WorkspaceProvisioningInput) {
      granted.permissionIds = provisioning.permissionIds;
      return Promise.resolve();
    },
    provisionWarehouse() {
      return Promise.resolve();
    },
  };

  const provisionInitialAccess = {
    execute() {
      return Promise.resolve({
        warehouseId: '00000000-0000-4000-8000-000000000003',
        roleId: '00000000-0000-4000-8000-000000000004',
        roleKind: 'warehouse_manager' as const,
        permissionIds: ['ROLES:WATCH'],
      });
    },
  };

  const service = new WorkspaceProvisioningService(
    repository as unknown as WorkspaceProvisioningRepository,
    provisionInitialAccess as unknown as ProvisionInitialAccessCommand,
  );

  return { granted, service };
};

const registration = {
  userId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  warehouseName: 'Склад',
};

describe('WorkspaceProvisioningService initial Workspace Owner Permission set', () => {
  it('writes the same set it reports, so the stored grant and the registration response cannot disagree', async () => {
    // Two separate reads of the set: one becomes `workspace_role_permissions`, the other becomes
    // `RegistrationResult.workspacePermissionIds`, which is what the shell gates its navigation on.
    // Nothing but this case stops the two from drifting apart — a response claiming a capability the
    // stored grant withholds is a shell that renders a surface every request to it then denies.
    const { granted, service } = setup();

    const result = await service.provisionRegistration(registration);

    expect([...result.workspacePermissionIds]).toEqual([
      ...granted.permissionIds,
    ]);
  });

  it('withholds nothing from the protected Workspace Owner Role', async () => {
    // The derivation's one knob is its exclusion list, and it is empty: the Workspace Owner holds
    // every Permission the vocabulary declares. Asserting the count makes adding an exclusion a
    // deliberate act that fails here first, rather than a quiet narrowing of what an Owner can do.
    const { granted, service } = setup();

    await service.provisionRegistration(registration);

    expect(granted.permissionIds).toHaveLength(
      Object.values(WorkspacePermissionId).length,
    );
  });

  it('grants WORKSPACE_OWNER_ROLE:REASSIGN, which is reserved to this Role rather than withheld from it', async () => {
    // AC-18 — the reserved entry is the one a reader is most likely to mistake for an exclusion,
    // because no custom Workspace Role may ever carry it. Excluded here instead, the protected Role
    // that exists to transfer ownership would be the one Role unable to.
    const { granted, service } = setup();

    await service.provisionRegistration(registration);

    expect(granted.permissionIds).toContain(
      WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
    );
  });
});
