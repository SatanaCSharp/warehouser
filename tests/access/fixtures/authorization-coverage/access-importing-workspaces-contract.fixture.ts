// Fixture only. Proves the check ALLOWS a file under `access` to import the published contract
// subpath `@warehouser/contracts/workspaces`. The subpath is named for the domain the schemas
// describe, not for the source module that consumes them, and guides/adding-and-using-contracts.md
// requires every REST request and response shape to come from `packages/contracts`. A module that
// serves a Warehouse-membership endpoint must therefore be able to import the Warehouse-membership
// schema regardless of which subpath it was published under.
import type { AssignableWarehouseRole } from '@warehouser/contracts/workspaces';

export const referencesWorkspacesContract = ():
  AssignableWarehouseRole | undefined => undefined;
