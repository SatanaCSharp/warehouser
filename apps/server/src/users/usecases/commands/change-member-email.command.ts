import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { isDefined } from '@warehouser/utils/predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { EmailAddress } from 'shared/domain/security/email-address';
import { isSupportedEmail } from 'shared/predicates/credential.predicates';
import {
  emailAlreadyRegisteredError,
  invalidInputError,
  managerRoleProtectedError,
  permissionExceededError,
  selfActionDeniedError,
  targetUnavailableError,
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

@Injectable()
export class ChangeMemberEmailCommand {
  constructor(
    private readonly memberLifecycleRepository: MemberLifecycleRepository,
    private readonly accessCurrentUserRepository: AccessCurrentUserRepository,
    private readonly authenticationRepository: AuthenticationRepository,
  ) {}

  @Transactional()
  async execute(
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
      !isDefined(
        await this.authenticationRepository.findAccountByNormalizedEmail(
          email.value,
        ),
      ),
      emailAlreadyRegisteredError(),
    );

    const now = new Date();

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
