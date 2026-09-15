import { ErrorCode } from '@warehouser/shared-types/enums';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';
import { describe, expect, it } from 'vitest';

describe('cross-module domain error factories', () => {
  // Cross-Workspace targeting: a target outside `principal.workspaceId` must be
  // indistinguishable from a missing target, so this is the one factory used for
  // both. This test proves that byte-identity structurally: it takes no
  // arguments that could leak which case triggered it, so two independent calls
  // from the two call sites always serialize identically — neither discloses
  // existence.
  it('produces a byte-identical error whether the target is missing or belongs to another Workspace', () => {
    const missingTargetError = workspaceTargetUnavailableError();
    const crossWorkspaceTargetError = workspaceTargetUnavailableError();

    expect(missingTargetError.code).toBe(
      ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
    );
    expect(JSON.stringify(missingTargetError)).toBe(
      JSON.stringify(crossWorkspaceTargetError),
    );
    expect(missingTargetError.message).toBe(crossWorkspaceTargetError.message);
    expect(missingTargetError.stack?.split('\n')[0]).toBe(
      crossWorkspaceTargetError.stack?.split('\n')[0],
    );
  });
});
