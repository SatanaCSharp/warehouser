---
id: T14
title: 'Move registration bootstrap into workspaces provisioning'
layer: 'app'
deps: ['T4', 'T6', 'T12']
acs: ['AC-01', 'AC-02']
files_hint:
  [
    'apps/server/src/workspaces/domain/services/workspace-provisioning.service.ts',
    'apps/server/src/auth/usecases/commands/register.command.ts',
    'apps/server/src/access/usecases/commands/provision-initial-access.command.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T14 — Move registration bootstrap into workspaces provisioning

## Why

[sad §6.1](../sad.md#61-registration-bootstrap) makes registration one orchestration inside the
transaction `RegisterCommand` already owns. AC-01 requires nine objects to be created as **one**
outcome and AC-02 requires all of them to disappear together when any part fails — which is only
true if nothing escapes that transaction.

## What

Add `workspaces/domain/services/workspace-provisioning.service.ts` as the transaction participant:
create the Workspace (unnamed), its protected Workspace Owner Role with the initial Workspace
Permission set from [spec §1](../spec.md#1-context), the Owner's Workspace membership, then the first
Warehouse — delegating that Warehouse's protected Manager Role and membership to `access`'s exported
provisioning service by passing a `warehouseId` and a `userId`.

Re-point `RegisterCommand` from `ProvisionInitialAccessCommand` to this service, keeping its
`@Transactional()` boundary, session establishment, credentials and cookie transport unchanged.
Reduce `ProvisionInitialAccessCommand` to the Warehouse-provisioning service `workspaces` calls.

## Definition of Done

- [ ] Command integration test: a successful registration creates exactly one linked Account, User,
      unnamed Workspace, protected Workspace Owner Role with its full initial Permission set,
      Workspace Role assignment, Warehouse in that Workspace, protected Warehouse Manager Role,
      Warehouse membership and initial session, and confirms immediate access (AC-01).
- [ ] Command integration tests with an injected failure at each stage prove none of those objects
      or access rights survives and the Visitor is told registration did not complete (AC-02).
- [ ] A test proves the registrant's `users.workspace_id` is set at creation and is never re-derived
      from memberships.
- [ ] `access` receives only a `warehouseId` and a `userId`; a test asserts `access` imports nothing
      from `workspaces`.
- [ ] The existing `auth` sign-up suite stays green, and `RegistrationResult` now also carries
      Workspace identity per [openapi.yaml](../contracts/openapi.yaml).
- [ ] lint + vet clean.

## Notes

Propagation keeps everything in the one transaction — do not open a second one
([sad §4](../sad.md#4-solution-strategy)). The Workspace is created **without** a name; the
placeholder is presentation, handled in [T35](./workspace-route-shell.md).
