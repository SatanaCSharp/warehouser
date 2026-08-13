import {
  workspaceMemberSchema,
  workspaceOwnerTransferResultSchema,
} from '@warehouser/contracts/workspaces';
import { z } from 'zod';

import { api } from 'shared/api/api-client';

import type {
  WorkspaceMember,
  WorkspaceMemberAdd,
  WorkspaceOwnerTransfer,
  WorkspaceOwnerTransferResult,
  WorkspaceRoleAssignment,
} from '@warehouser/contracts/workspaces';
import type { ApiFailure } from 'shared/api/api-client';

const WORKSPACE_MEMBERS_PATH = '/api/v1/workspace/members';
const WORKSPACE_OWNER_TRANSFER_PATH = '/api/v1/workspace/owner-transfer';

const workspaceMemberListSchema = z.array(workspaceMemberSchema);

type WorkspaceRoleReassignment = WorkspaceRoleAssignment & { userId: string };

type MembershipTag =
  'WorkspaceContext' | 'WorkspaceMembers' | 'WorkspaceRoles' | 'WorkspaceUsers';

/**
 * A refused write is itself evidence that the actor's capability projection is
 * stale — the Workspace Role they were relying on changed while the page was
 * open — so the actor context is refreshed even though nothing committed
 * (design-handoff.md §States, `OD62T`).
 */
const AUTHORITY_REFUSAL_CODE = 'workspace.denied';

/**
 * Every Workspace membership write refreshes the same four cached reads: the
 * Members list it changed, the Users list that is its candidate source
 * (`isWorkspaceMember` moves with it), the Workspace Roles (their assigned
 * member counts move with it) and the actor context, because the acting member
 * can narrow their own capabilities — an Owner transfer always does.
 */
const membershipWriteTags = (
  _result: unknown,
  error: ApiFailure | undefined,
): MembershipTag[] => {
  if (!error) {
    return [
      'WorkspaceContext',
      'WorkspaceMembers',
      'WorkspaceRoles',
      'WorkspaceUsers',
    ];
  }

  return error.code === AUTHORITY_REFUSAL_CODE ? ['WorkspaceContext'] : [];
};

/**
 * Workspace membership: who administers the Workspace, in which Workspace Role,
 * and the protected transfer of Workspace Owner (sad.md §6.6, AC-19 – AC-22,
 * AC-26). The Members read is gated by `WORKSPACE_MEMBERS:WATCH` (AC-33) and is
 * requested only when the actor holds it.
 */
export const workspaceMembersApi = api.injectEndpoints({
  endpoints: (build) => ({
    listWorkspaceMembers: build.query<WorkspaceMember[], void>({
      query: () => WORKSPACE_MEMBERS_PATH,
      extraOptions: { schema: workspaceMemberListSchema },
      providesTags: ['WorkspaceMembers'],
    }),
    addWorkspaceMember: build.mutation<WorkspaceMember, WorkspaceMemberAdd>({
      query: (body) => ({ url: WORKSPACE_MEMBERS_PATH, method: 'POST', body }),
      extraOptions: { schema: workspaceMemberSchema },
      invalidatesTags: membershipWriteTags,
    }),
    removeWorkspaceMember: build.mutation<null, string>({
      query: (userId) => ({
        url: `${WORKSPACE_MEMBERS_PATH}/${userId}`,
        method: 'DELETE',
      }),
      extraOptions: { emptyResponse: null },
      invalidatesTags: membershipWriteTags,
    }),
    assignWorkspaceRole: build.mutation<
      WorkspaceMember,
      WorkspaceRoleReassignment
    >({
      query: ({ userId, ...body }) => ({
        url: `${WORKSPACE_MEMBERS_PATH}/${userId}/role`,
        method: 'PUT',
        body,
      }),
      extraOptions: { schema: workspaceMemberSchema },
      invalidatesTags: membershipWriteTags,
    }),
    transferWorkspaceOwner: build.mutation<
      WorkspaceOwnerTransferResult,
      WorkspaceOwnerTransfer
    >({
      query: (body) => ({
        url: WORKSPACE_OWNER_TRANSFER_PATH,
        method: 'POST',
        body,
      }),
      extraOptions: { schema: workspaceOwnerTransferResultSchema },
      invalidatesTags: membershipWriteTags,
    }),
  }),
  overrideExisting: false,
});

export const {
  useAddWorkspaceMemberMutation,
  useAssignWorkspaceRoleMutation,
  useListWorkspaceMembersQuery,
  useRemoveWorkspaceMemberMutation,
  useTransferWorkspaceOwnerMutation,
} = workspaceMembersApi;
