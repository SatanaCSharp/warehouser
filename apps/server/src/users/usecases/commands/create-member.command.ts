import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';
import { EmailAddress } from 'shared/domain/security/email-address';
import { isSupportedEmail } from 'shared/domain/security/is-supported-email';
import { isSupportedPassword } from 'shared/domain/security/is-supported-password';
import { Password } from 'shared/domain/security/password';
import { hashPassword } from 'shared/domain/security/password-hashing';
import {
  permissionExceededError,
  reservedRoleSelectionError,
} from 'users/domain/errors/users.errors';
import {
  exceedsActorPermissions,
  isReservedManagerRoleSelection,
} from 'users/domain/predicates/member-lifecycle.predicates';

export interface CreateMemberInput {
  readonly email: string;
  readonly password: string;
  readonly roleId: string;
}

export interface CreatedMember {
  readonly id: string;
  readonly email: string;
  readonly roleId: string;
}

export interface CreateMemberRuntime {
  readonly identityId: () => string;
  readonly now: () => Date;
}

// AC-09/AC-16's cross-Warehouse-hiding and Permission-exceeded denials are the
// identical authorization-boundary conditions `access` already produces for
// its own administration actions (sad.md §4) — this feature reuses the same
// stable ErrorCode rather than redefining it, without importing `access`'s
// feature-owned error factories (`users` never imports `access/*`/`auth/*`).
const targetUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_TARGET_UNAVAILABLE);

// AC-02/AC-05 reuse `auth`'s registration-time credential rules and stable
// error codes verbatim (spec.md §5 note; ADR-0001) — constructed directly
// here rather than importing `auth/domain/errors/*`, which is `auth`-owned.
const invalidInputError = (
  fields?: Readonly<Record<string, string>>,
): ApplicationError =>
  new ApplicationError(
    ErrorCode.AUTH_INVALID_INPUT,
    fields ? { fields } : undefined,
  );

const emailAlreadyRegisteredError = (): ApplicationError =>
  new ApplicationError(ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED);

const defaultRuntime: CreateMemberRuntime = {
  identityId: () => randomUUID(),
  now: () => new Date(),
};

@Injectable()
export class CreateMemberCommand {
  constructor(
    private readonly accessCurrentUserRepository: AccessCurrentUserRepository,
    private readonly roleLifecycleRepository: RoleLifecycleRepository,
    private readonly memberLifecycleRepository: MemberLifecycleRepository,
    private readonly authenticationRepository: AuthenticationRepository,
    private readonly hash: typeof hashPassword = hashPassword,
    private readonly runtime: CreateMemberRuntime = defaultRuntime,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: CreateMemberInput,
  ): Promise<CreatedMember> {
    const currentAccess =
      await this.accessCurrentUserRepository.resolveCurrentAccess(
        currentUser.userId,
      );
    assertDefined(currentAccess, targetUnavailableError());

    // Lock the selected Role row (sad.md §4: "the selected Role row [is]
    // locked before its current state is re-checked") with a kind-agnostic
    // lookup, so a missing/cross-Warehouse Role (AC-09) is distinguishable
    // from the reserved Warehouse Manager Role (AC-20) — `findCustomRole`/
    // `lockCustomRole` filter `kind = 'custom'` and would collapse both
    // cases to the same "not found" result.
    const role = await this.roleLifecycleRepository.lockRoleById(
      currentUser.warehouseId,
      input.roleId,
    );
    assertDefined(role, targetUnavailableError());

    assert(
      !isReservedManagerRoleSelection(role.kind),
      reservedRoleSelectionError(),
    );

    const rolePermissionIds =
      await this.memberLifecycleRepository.findRoleGrantedPermissionIds(
        role.id,
      );
    assert(
      !exceedsActorPermissions(
        [...currentAccess.permissionIds],
        rolePermissionIds,
      ),
      permissionExceededError(),
    );

    const emailSupported = isSupportedEmail(input.email);
    const passwordSupported = isSupportedPassword(input.password);
    assert(
      emailSupported && passwordSupported,
      invalidInputError({
        ...(!emailSupported && { email: 'unsupported' }),
        ...(!passwordSupported && { password: 'unsupported' }),
      }),
    );

    const email = EmailAddress.create(input.email);
    const password = Password.create(input.password);

    assert(
      !(await this.authenticationRepository.findAccountByNormalizedEmail(
        email.value,
      )),
      emailAlreadyRegisteredError(),
    );

    const credential = await this.hash(password.value);
    const identityId = this.runtime.identityId();
    const now = this.runtime.now();

    // Creation issues no Session (unlike registration) — the new member
    // signs in later through the existing, unmodified sign-in command
    // (sad.md §4, AC-12).
    await this.authenticationRepository.createIdentity({
      account: {
        id: identityId,
        userId: identityId,
        normalizedEmail: email.value,
        passwordHash: credential.hash,
        passwordHashAlgorithm: credential.algorithm,
        passwordHashParameters: credential.parameters,
        createdAt: now,
        updatedAt: now,
      },
      user: {
        id: identityId,
        accountId: identityId,
        createdAt: now,
        updatedAt: now,
      },
    });

    await this.memberLifecycleRepository.insertMembership({
      userId: identityId,
      warehouseId: currentUser.warehouseId,
      roleId: role.id,
      roleKind: 'custom',
    });

    return { id: identityId, email: email.value, roleId: role.id };
  }
}
