import { isDefined } from '@warehouser/utils/predicates';
import type { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';

// The two halves of the Owner-transfer precondition, rechecked by
// `shared/domain/repositories/workspace-owner-transfer.repository.ts` under the locks the transfer
// has just taken. Named conditions rather than one composite expression, so a refusal is
// attributable to the side that failed (server-error-handling.md §1).

export const stillHoldsOwnerSlot = (
  membership: WorkspaceMembershipEntity | undefined,
  workspaceId: string,
  ownerRoleId: string,
): boolean =>
  isDefined(membership) &&
  membership.workspaceId === workspaceId &&
  membership.workspaceRoleId === ownerRoleId &&
  membership.workspaceRoleKind === 'workspace_owner';

export const belongsToWorkspace = (
  membership: WorkspaceMembershipEntity | undefined,
  workspaceId: string,
): boolean => isDefined(membership) && membership.workspaceId === workspaceId;
