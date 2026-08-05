---
status: Living
updated_at: '2026-08-03'
---

# Domain Context — access

## Glossary

- Permission — A system-defined authorization capability with a stable name-and-action identifier and display label, maintained through application migrations. NOT Role, which groups Permissions for assignment to warehouse members.
- Role — A named, Warehouse-scoped aggregation of system-defined Permissions that is assigned to warehouse members. NOT Permission, which represents one indivisible authorization capability.
- User-accessible business capability — A business operation a person can invoke through an authenticated product surface and that therefore requires an explicit Permission rule and Warehouse-ownership check. NOT infrastructure-only resource, which supports system operation and cannot be invoked by a person as a business capability.
- Visitor — A person who has not established an authenticated session and may register a new Warehouse as its first Warehouse Manager. NOT Warehouse Member, who already belongs to a Warehouse and holds a Role.
- Warehouse — The ownership boundary to which each warehouse member, Role, and warehouse resource belongs. NOT Location, which will later represent a physical or operational subdivision within a Warehouse.
- Warehouse Manager — The single warehouse member holding the protected, system-defined Warehouse Manager Role for a Warehouse. NOT a custom Role, which authorized warehouse members may create, rename, modify, replace, or delete under access rules.
- Warehouse Member — A User who belongs to exactly one Warehouse and holds exactly one Role in that Warehouse. NOT Account Holder, which describes authenticated identity without implying warehouse authorization.

## Invariants

- Every Warehouse has exactly one Warehouse Manager.
- Every Warehouse Member belongs to exactly one Warehouse and holds exactly one Role.
- Roles and Role assignments never cross Warehouse boundaries.
- Permission definitions and the Warehouse Manager Role are system-managed.
- `WAREHOUSE_MANAGER_ROLE:REASSIGN` is reserved to the Warehouse Manager Role and cannot be included in a custom Role; future reserved Permissions require an explicit system-catalogue extension.
