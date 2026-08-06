import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { isSupportedPassword } from 'shared/domain/security/is-supported-password';
import { hashPassword } from 'shared/domain/security/password-hashing';
import {
  managerRoleProtectedError,
  permissionExceededError,
  selfActionDeniedError,
} from 'users/domain/errors/users.errors';
import {
  exceedsActorPermissions,
  isProtectedManagerTarget,
  isSelfAction,
} from 'users/domain/predicates/member-lifecycle.predicates';

export interface ChangeMemberPasswordInput {
  readonly targetUserId: string;
  readonly newPassword: string;
}

// AC-09/AC-16's cross-Warehouse-hiding denial reuses `access`'s stable
// ErrorCode verbatim (spec.md §5 note; ADR-0001) — constructed directly here
// rather than importing `access`'s feature-owned error factories (`users`
// never imports `access/*`/`auth/*`).
const targetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_TARGET_UNAVAILABLE);

// AC-07 reuses `auth`'s registration-time password rules and stable error
// code verbatim (spec.md §5 note; ADR-0001) — constructed directly here
// rather than importing `auth/domain/errors/*`, which is `auth`-owned.
const invalidInputError = (
  fields?: Readonly<Record<string, string>>,
): ApplicationError =>
  new ApplicationError(
    ErrorCode.AUTH_INVALID_INPUT,
    fields ? { fields } : undefined,
  );

@Injectable()
export class ChangeMemberPasswordCommand {
  constructor(
    private readonly memberLifecycleRepository: MemberLifecycleRepository,
    private readonly accessCurrentUserRepository: AccessCurrentUserRepository,
    private readonly authenticationRepository: AuthenticationRepository,
    private readonly hash: typeof hashPassword = hashPassword,
    private readonly now: () => Date = () => new Date(),
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: ChangeMemberPasswordInput,
  ): Promise<void> {
    // Lock the target's Warehouse Membership (sad.md §6.3) before any
    // invariant is re-checked, scoped to the actor's own Warehouse — a
    // missing row is indistinguishable from a cross-Warehouse target
    // (AC-09).
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

    const currentAccess =
      await this.accessCurrentUserRepository.resolveCurrentAccess(
        currentUser.userId,
      );
    assertDefined(currentAccess, targetUnavailableError());

    const rolePermissionIds =
      await this.memberLifecycleRepository.findRoleGrantedPermissionIds(
        membership.roleId,
      );
    assert(
      !exceedsActorPermissions(
        [...currentAccess.permissionIds],
        rolePermissionIds,
      ),
      permissionExceededError(),
    );

    assert(
      isSupportedPassword(input.newPassword),
      invalidInputError({ password: 'unsupported' }),
    );

    const credential = await this.hash(input.newPassword);
    const changedAt = this.now();

    await this.authenticationRepository.updateCredential(
      membership.userId,
      credential,
      changedAt,
    );

    // AC-06: a stale browser cannot continue using the old credential's
    // Session once the password has changed (sad.md §6.3).
    await this.authenticationRepository.revokeSessionsByAccountId(
      membership.userId,
      changedAt,
    );
  }
}
