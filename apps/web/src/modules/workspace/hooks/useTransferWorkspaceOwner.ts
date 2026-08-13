import { useCallback } from 'react';

import { useTransferWorkspaceOwnerMutation } from 'modules/workspace/api/workspace-members-api';
import { runWorkspaceMutation } from 'modules/workspace/api/workspace-mutation';

import type { WorkspaceOwnerTransfer } from '@warehouser/contracts/workspaces';
import type { MutationOutcome } from 'modules/workspace/types/workspace.types';

export type TransferWorkspaceOwner = (
  transfer: WorkspaceOwnerTransfer,
) => Promise<MutationOutcome>;

/**
 * Transfers Workspace Owner. The recipient becomes the sole Owner and the
 * outgoing Owner receives the chosen custom Workspace Role as one outcome
 * (AC-26) — a refusal therefore leaves the Workspace with exactly the Owner it
 * already had (AC-26a).
 */
export const useTransferWorkspaceOwner = (): TransferWorkspaceOwner => {
  const [transferWorkspaceOwner] = useTransferWorkspaceOwnerMutation();

  return useCallback(
    (transfer) =>
      runWorkspaceMutation(
        'transferWorkspaceOwner',
        transferWorkspaceOwner(transfer),
      ),
    [transferWorkspaceOwner],
  );
};
