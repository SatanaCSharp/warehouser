import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { PinoLogger } from 'nestjs-pino';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { EmailAddress } from 'shared/domain/security/email-address';
import { isSupportedEmail } from 'shared/domain/security/is-supported-email';
import { withOperationTiming } from 'shared/logger/with-operation-timing';
import {
  emailAlreadyRegisteredError,
  invalidInputError,
  managerRoleProtectedError,
  permissionExceededError,
  selfActionDeniedError,
} from 'users/domain/errors/users.errors';
import {
  exceedsActorPermissions,
  isProtectedManagerTarget,
  isSelfAction,
} from 'users/domain/predicates/member-lifecycle.predicates';

export interface ChangeMemberEmailInput {
  readonly targetUserId: string;
  readonly email: string;
}

export interface ChangedMemberEmail {
  readonly userId: string;
  readonly email: string;
}

export interface ChangeMemberEmailRuntime {
  readonly now: () => Date;
}

// AC-09's cross-Warehouse-hiding denial is the identical authorization-
// boundary condition `access` already produces for its own administration
// actions (sad.md §4) — this feature reuses the same stable ErrorCode rather
// than redefining it, without importing `access`'s feature-owned error
// factories (`users` never imports `access/*`/`auth/*`).
const targetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_TARGET_UNAVAILABLE);

const defaultRuntime: ChangeMemberEmailRuntime = {
  now: () => new Date(),
};

@Injectable()
export class ChangeMemberEmailCommand {
  constructor(
    private readonly memberLifecycleRepository: MemberLifecycleRepository,
    private readonly accessCurrentUserRepository: AccessCurrentUserRepository,
    private readonly authenticationRepository: AuthenticationRepository,
    private readonly runtime: ChangeMemberEmailRuntime = defaultRuntime,
    private readonly logger: PinoLogger = new PinoLogger({}),
  ) {}

  @Transactional()
  execute(
    currentUser: AccessCurrentUser,
    input: ChangeMemberEmailInput,
  ): Promise<ChangedMemberEmail> {
    return withOperationTiming(
      this.logger,
      'users.change_member_email',
      currentUser,
      () => this.changeMemberEmail(currentUser, input),
    );
  }

  private async changeMemberEmail(
    currentUser: AccessCurrentUser,
    input: ChangeMemberEmailInput,
  ): Promise<ChangedMemberEmail> {
    const currentAccess =
      await this.accessCurrentUserRepository.resolveCurrentAccess(
        currentUser.userId,
        currentUser.warehouseId,
      );
    assertDefined(currentAccess, targetUnavailableError());

    // Lock the target's Warehouse Membership (sad.md §6.2 step 2), scoped to
    // the actor's own Warehouse — a missing row is indistinguishable from a
    // cross-Warehouse target (AC-09).
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

    const targetPermissionIds =
      await this.memberLifecycleRepository.findRoleGrantedPermissionIds(
        membership.roleId,
      );
    assert(
      !exceedsActorPermissions(
        [...currentAccess.permissionIds],
        targetPermissionIds,
      ),
      permissionExceededError(),
    );

    assert(
      isSupportedEmail(input.email),
      invalidInputError({ email: 'unsupported' }),
    );

    const email = EmailAddress.create(input.email);

    assert(
      !(await this.authenticationRepository.findAccountByNormalizedEmail(
        email.value,
      )),
      emailAlreadyRegisteredError(),
    );

    const now = this.runtime.now();

    // The target's Sessions are intentionally left untouched (AC-04) — unlike
    // a password change, an email change does not revoke active Sessions.
    await this.authenticationRepository.updateEmail(
      membership.userId,
      email.value,
      now,
    );

    return { userId: membership.userId, email: email.value };
  }
}
