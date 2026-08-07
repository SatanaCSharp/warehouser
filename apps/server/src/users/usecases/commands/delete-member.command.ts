import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { PinoLogger } from 'nestjs-pino';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { withOperationTiming } from 'shared/logger/with-operation-timing';
import {
  managerRoleProtectedError,
  selfActionDeniedError,
} from 'users/domain/errors/users.errors';
import {
  isProtectedManagerTarget,
  isSelfAction,
} from 'users/domain/predicates/member-lifecycle.predicates';

export interface DeleteMemberInput {
  readonly targetUserId: string;
}

export interface DeletedMember {
  readonly id: string;
}

// AC-09's cross-Warehouse-hiding denial is the identical authorization-
// boundary condition `access` already produces for its own administration
// actions (sad.md §4) — this feature reuses the same stable ErrorCode rather
// than redefining it, without importing `access`'s feature-owned error
// factories (`users` never imports `access/*`/`auth/*`).
const targetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_TARGET_UNAVAILABLE);

@Injectable()
export class DeleteMemberCommand {
  constructor(
    private readonly memberLifecycleRepository: MemberLifecycleRepository,
    private readonly authenticationRepository: AuthenticationRepository,
    private readonly logger: PinoLogger = new PinoLogger({}),
  ) {}

  @Transactional()
  execute(
    currentUser: AccessCurrentUser,
    input: DeleteMemberInput,
  ): Promise<DeletedMember> {
    return withOperationTiming(
      this.logger,
      'users.delete_member',
      currentUser,
      () => this.deleteMember(currentUser, input),
    );
  }

  private async deleteMember(
    currentUser: AccessCurrentUser,
    input: DeleteMemberInput,
  ): Promise<DeletedMember> {
    // Lock the Warehouse row first, matching
    // `TransferWarehouseManagerCommand`'s own lock ordering (AC-15): a
    // concurrent manager transfer locks the Warehouse row before its
    // replacement Role and membership rows, so acquiring it here too
    // serializes this command against a racing transfer at the earliest
    // possible point, rather than only at the target's membership row —
    // whichever side is still blocked here re-reads fully committed
    // post-transfer state once it proceeds, guaranteeing the transfer always
    // completes and a racing deletion of the outgoing or incoming holder is
    // always refused.
    await this.memberLifecycleRepository.lockWarehouse(currentUser.warehouseId);

    // Lock the target's Warehouse Membership row (sad.md §6.4 step 2), scoped
    // to the actor's own Warehouse — a missing row is indistinguishable from
    // a cross-Warehouse target (AC-09).
    const membership = await this.memberLifecycleRepository.lockMembership(
      currentUser.warehouseId,
      input.targetUserId,
    );
    assertDefined(membership, targetUnavailableError());

    assert(
      !isSelfAction(currentUser.userId, input.targetUserId),
      selfActionDeniedError(),
    );

    assert(
      !isProtectedManagerTarget(membership.roleKind),
      managerRoleProtectedError(),
    );

    // Deletion sequencing (data-model.md "Deletion sequencing"): the
    // Warehouse Membership row must be deleted before the target's Sessions,
    // which must be hard-deleted (not merely revoked) before the target's
    // Account+User pair, to satisfy the immediate (non-deferrable) RESTRICT
    // foreign keys in that exact order.
    await this.memberLifecycleRepository.deleteMembership(
      currentUser.warehouseId,
      membership.userId,
    );
    await this.authenticationRepository.deleteSessionsByAccountId(
      membership.userId,
    );
    await this.authenticationRepository.deleteIdentity(membership.userId);

    return { id: membership.userId };
  }
}
