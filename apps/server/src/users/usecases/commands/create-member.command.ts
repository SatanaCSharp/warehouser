import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository.js';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository.js';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository.js';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository.js';
import { EmailAddress } from 'shared/domain/security/email-address.js';
import { isSupportedEmail } from 'shared/domain/security/is-supported-email.js';
import { isSupportedPassword } from 'shared/domain/security/is-supported-password.js';
import { Password } from 'shared/domain/security/password.js';
import { hashPassword } from 'shared/domain/security/password-hashing.js';
import {
  emailAlreadyRegisteredError,
  invalidInputError,
  permissionExceededError,
  reservedRoleSelectionError,
} from 'users/domain/errors/users.errors.js';
import {
  exceedsActorPermissions,
  isReservedManagerRoleSelection,
} from 'users/domain/predicates/member-lifecycle.predicates.js';

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

// A missing/cross-Warehouse Role is the Role-not-found case specifically —
// distinct from the actor's own membership resolution above — and reuses
// `access`'s stable `ACCESS_ROLE_UNAVAILABLE` code for the same reason
// `targetUnavailableError` reuses `ACCESS_TARGET_UNAVAILABLE`.
const roleUnavailableError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_ROLE_UNAVAILABLE);

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
        currentUser.warehouseId,
      );
    assertDefined(currentAccess, targetUnavailableError());

    // The new member's Workspace relation is established from the Workspace
    // owning the named Warehouse (spec.md §1, second boundary; AC-24) —
    // read through the shared `WarehouseEntity` row rather than importing
    // `workspaces` (`users` must not depend on that feature module).
    const warehouse = await this.memberLifecycleRepository.lockWarehouse(
      currentUser.warehouseId,
    );
    assertDefined(warehouse, targetUnavailableError());

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
    assertDefined(role, roleUnavailableError());

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
        workspaceId: warehouse.workspaceId,
        createdAt: now,
        updatedAt: now,
      },
    });

    await this.memberLifecycleRepository.insertMembership({
      userId: identityId,
      warehouseId: currentUser.warehouseId,
      workspaceId: warehouse.workspaceId,
      roleId: role.id,
      roleKind: 'custom',
    });

    return { id: identityId, email: email.value, roleId: role.id };
  }
}
