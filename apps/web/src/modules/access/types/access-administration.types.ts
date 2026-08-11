import type {
  MemberPage,
  PermissionPage,
  RolePage,
  RoleWrite,
} from '@warehouser/contracts/access';
import type {
  CreateMemberInput,
  EmailChangeInput,
  PasswordChangeInput,
} from '@warehouser/contracts/users';

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

/**
 * Every mutation the administration surface delegates to its owner. Kept as one
 * named contract so the view, its workflow dialogs, and the hook that binds the
 * mutations all depend on the same abstraction instead of on each other.
 */
export type AccessAdministrationActions = {
  onAssignRole: (userId: string, roleId: string) => Promise<MutationOutcome>;
  onChangeMemberEmail: (
    userId: string,
    input: EmailChangeInput,
  ) => Promise<MutationOutcome>;
  onChangeMemberPassword: (
    userId: string,
    input: PasswordChangeInput,
  ) => Promise<MutationOutcome>;
  onCreateMember: (input: CreateMemberInput) => Promise<MutationOutcome>;
  onDeleteMember: (userId: string) => Promise<MutationOutcome>;
  onDeleteRole: (
    roleId: string,
    replacementRoleId: string | null,
  ) => Promise<MutationOutcome>;
  onSaveRole: SaveRole;
  onTransferManager: (
    recipientUserId: string,
    formerManagerRoleId: string,
  ) => Promise<MutationOutcome>;
};

/** The administration workflow a trigger asks the surface to open. */
export type AccessWorkflow =
  | { kind: 'assign'; memberId: string }
  | { kind: 'create' }
  | { kind: 'delete'; role: AccessRole }
  | { kind: 'deleteMember'; member: AccessMember }
  | { kind: 'editEmail'; member: AccessMember }
  | { kind: 'resetPassword'; member: AccessMember }
  | { kind: 'role'; role?: AccessRole }
  | { kind: 'transfer' };

export type OpenAccessWorkflow = (workflow: AccessWorkflow) => void;
