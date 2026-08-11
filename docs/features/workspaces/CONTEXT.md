---
status: Living
updated_at: '2026-08-11'
---

# Domain Context — workspaces

## Glossary

- Active Warehouse — The one Warehouse a Warehouse Member has selected to be shown, chosen from the Warehouses that member holds a membership in. It is presentation state that persists until changed. NOT an input to any authorization decision, because every Warehouse-scoped request names the Warehouse it applies to. NOT Workspace, which is fixed for a User and never selected.
- Archived Warehouse — A Warehouse withdrawn from operation that no longer appears as selectable and accepts no change to itself or to any resource it owns, while its Roles, memberships, and records are retained, remain readable by its members, and it can be restored. NOT a deleted Warehouse, which this release does not provide. NOT a hidden Warehouse, since archiving withdraws a Warehouse from operation without withdrawing the account of what happened in it.
- Warehouse Capability — An operation whose subject is a resource a Warehouse owns, authorized by the Role held in that Warehouse. NOT Workspace Capability, whose subject is the Warehouse record itself or a membership edge into it and which is authorized by a Workspace Permission.
- Workspace — The outermost ownership boundary, aggregating the Warehouses of one organization together with its own Roles, Permissions, and membership. NOT Warehouse, which is the operational boundary that owns warehouse Roles and warehouse resources. NOT the web "workspace" component naming used for tabbed administration pages, which is presentation vocabulary and carries no domain meaning.
- Workspace Member — A User who has been granted exactly one Workspace Role in a Workspace. NOT Warehouse Member, who belongs to a Warehouse and is never a Workspace Member by default.
- Workspace Owner — The single Workspace Member holding the protected, system-defined Workspace Owner Role for a Workspace. NOT Warehouse Manager, who holds the protected system-defined Role of exactly one Warehouse.
- Workspace Permission — A system-defined authorization capability at the Workspace level with a stable name-and-action identifier and display label, maintained through application migrations. NOT Permission, which authorizes a capability inside a single Warehouse.
- Workspace Role — A named, Workspace-scoped aggregation of system-defined Workspace Permissions assigned to Workspace Members. NOT Role, which is Warehouse-scoped and governs capabilities inside one Warehouse.

## Invariants

- Every Workspace has exactly one Workspace Owner.
- Every User belongs to exactly one Workspace.
- Every Workspace Member belongs to exactly one Workspace and holds exactly one Workspace Role.
- Workspace Roles and Workspace Role assignments never cross Workspace boundaries.
- Every Warehouse belongs to exactly one Workspace.
- All of a User's Warehouse memberships belong to Warehouses of the same Workspace.
- Every Warehouse, including a newly created and an archived one, has exactly one Warehouse Manager.
- A Workspace Permission never authorizes an operation inside a Warehouse, and a Permission never authorizes a Workspace capability. The subject of the operation decides which it is: the Warehouse record itself or a membership edge into it is a Workspace Capability, and a resource the Warehouse owns is a Warehouse Capability.
- Every Workspace keeps at least one Warehouse that is not archived.
- Every Warehouse-scoped request names exactly one Warehouse; a request that does not is refused rather than resolved to a default.
- A User belongs to a Workspace through a relation established at registration, never derived from that User's Warehouse memberships.
- Every authorization decision re-reads Workspace Roles, Workspace Permissions, and Warehouse memberships from the store, never from a session or token.
- A Warehouse membership granted by membership assignment can be withdrawn by membership revocation, except the membership carrying the protected Warehouse Manager Role.
- Workspace Permission definitions and the Workspace Owner Role are system-managed.
- `WORKSPACE_OWNER_ROLE:REASSIGN` is reserved to the Workspace Owner Role and cannot be included in a custom Workspace Role; future reserved Workspace Permissions require an explicit system-catalogue extension.

## Out of scope

- Permanent deletion of a Warehouse; this release provides reversible archiving only.
- Membership in more than one Workspace.
- Member-defined Workspace Permission definitions.
- Preserving pre-existing Warehouse, membership, and Role records; the schema is rebuilt by rolling back every migration and running them again from the beginning.
