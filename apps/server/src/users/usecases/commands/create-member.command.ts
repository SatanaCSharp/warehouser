import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { isDefined } from '@warehouser/utils/predicates';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';
import { EmailAddress } from 'shared/domain/security/email-address';
import { Password } from 'shared/domain/security/password';
import { hashPassword } from 'shared/domain/security/password-hashing';
import {
  isSupportedEmail,
  isSupportedPassword,
} from 'shared/predicates/credential.predicates';
import {
  emailAlreadyRegisteredError,
  invalidInputError,
  permissionExceededError,
  reservedRoleSelectionError,
  roleUnavailableError,
  targetUnavailableError,
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

@Injectable()
export class CreateMemberCommand {
  constructor(
    private readonly accessCurrentUserRepository: AccessCurrentUserRepository,
    private readonly roleLifecycleRepository: RoleLifecycleRepository,
    private readonly memberLifecycleRepository: MemberLifecycleRepository,
    private readonly authenticationRepository: AuthenticationRepository,
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

    assert(
      isSupportedEmail(input.email) && isSupportedPassword(input.password),
      invalidInputError({
        ...(isSupportedEmail(input.email) ? {} : { email: 'unsupported' }),
        ...(isSupportedPassword(input.password)
          ? {}
          : { password: 'unsupported' }),
      }),
    );

    const email = EmailAddress.create(input.email);
    const password = Password.create(input.password);

    assert(
      !isDefined(
        await this.authenticationRepository.findAccountByNormalizedEmail(
          email.value,
        ),
      ),
      emailAlreadyRegisteredError(),
    );

    const credential = await hashPassword(password.value);
    const identityId = randomUUID();
    const now = new Date();

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
