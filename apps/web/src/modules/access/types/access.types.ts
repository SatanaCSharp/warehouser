import type {
  MemberPage,
  PermissionPage,
  RolePage,
} from '@warehouser/contracts/access';

export type AccessMember = MemberPage['items'][number];
export type AccessPermission = PermissionPage['items'][number];
export type AccessRole = RolePage['items'][number];
