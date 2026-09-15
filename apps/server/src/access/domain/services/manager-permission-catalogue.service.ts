import { PermissionId } from '@warehouser/shared-types/enums';

// The protected Warehouse Manager Role is granted the whole Permission catalogue, so this list is
// derived from `PermissionId` rather than restated. A hand-maintained copy silently kept the set a
// release lagged behind: `ordering` added sixteen Permissions and backfilled the Roles that already
// existed (`migrations/1786600100000-GrantOrderingPermissions.ts`), but every Warehouse provisioned
// afterwards was still given the twelve pre-`ordering` ones, so its Manager was refused every items,
// demand and Purchase Draft operation. Deriving keeps the two halves of that pairing in step.
//
// A Permission the Manager must NOT hold goes here, and only here; nothing else about this file
// changes when the catalogue grows.
const MANAGER_EXCLUDED_PERMISSION_IDS: readonly PermissionId[] = [];

export const MANAGER_PERMISSION_IDS: readonly PermissionId[] = Object.values(
  PermissionId,
).filter(
  (permissionId) => !MANAGER_EXCLUDED_PERMISSION_IDS.includes(permissionId),
);
