import type {
  MemberPage,
  PermissionPage,
  RolePage,
  RoleWrite,
} from '@warehouser/contracts/access';

export type AccessMember = MemberPage['items'][number];
export type AccessPermission = PermissionPage['items'][number];
export type AccessRole = RolePage['items'][number];

export type MutationOutcome = {
  success: boolean;
  fieldErrors?: Record<string, string>;
};

export type SaveRole = (
  input: RoleWrite,
  roleId?: string,
) => Promise<MutationOutcome>;
