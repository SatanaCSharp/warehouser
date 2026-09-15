import { randomUUID } from 'node:crypto';

import { assert } from '@warehouser/utils/asserts';
import { isDefined } from '@warehouser/utils/predicates';
import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { User } from 'auth/domain/entities/user';
import {
  AuthEmailAlreadyRegisteredError,
  AuthInvalidInputError,
  AuthRegistrationUnavailableError,
} from 'auth/domain/errors/auth.errors';
import { generateSessionSecret } from 'auth/domain/security/session-secret';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { EmailAddress } from 'shared/domain/security/email-address';
import { Password } from 'shared/domain/security/password';
import { hashPassword } from 'shared/domain/security/password-hashing';
import {
  isSupportedEmail,
  isSupportedPassword,
} from 'shared/predicates/credential.predicates';
import type {
  ProvisionRegistrationResult,
  WorkspaceProvisioningService,
} from 'workspaces/domain/services/workspace-provisioning.service';

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly warehouseName: string;
}

export interface RegisteredSession extends ProvisionRegistrationResult {
  readonly userId: string;
  readonly sessionSecret: string;
  readonly expiresAt: Date;
}

export class RegisterCommand {
  constructor(
    private readonly authentication: AuthenticationRepository,
    private readonly registrations: AuthRegistrationService,
    private readonly workspaceProvisioning: WorkspaceProvisioningService,
  ) {}

  @Transactional()
  async execute(input: RegisterInput): Promise<RegisteredSession> {
    assert(
      isSupportedEmail(input.email) && isSupportedPassword(input.password),
      AuthInvalidInputError({
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
        await this.authentication.findAccountByNormalizedEmail(email.value),
      ),
      AuthEmailAlreadyRegisteredError(),
    );

    const credential = await hashPassword(password.value);
    const account = Account.create({
      id: randomUUID(),
      email: email.value,
      credential,
    });
    const user = User.forAccount(account);
    const generated = generateSessionSecret();
    const session = Session.establish({
      id: SessionId.create(randomUUID()),
      accountId: account.id,
      digest: SessionDigest.create(generated.digest),
      establishedAt: new Date(),
    });
    // The registrant's Workspace relation is established at creation and
    // never re-derived from Warehouse memberships (spec.md §1, second
    // boundary), so the Workspace id is generated before the identity write
    // that references it. `fk_users_workspace_id` is `DEFERRABLE INITIALLY
    // DEFERRED`, so the User row may be inserted before workspace
    // provisioning creates the matching Workspace row, as long as both
    // commit together (sad.md §6.1).
    const workspaceId = randomUUID();

    // The identity write and Workspace/Warehouse provisioning are one
    // failure boundary: a technical failure at either point means the
    // registration did not happen at all. Classify it as the known
    // registration-unavailable condition and keep the originating failure as
    // `cause` so the global filter can log it without exposing it.
    let provisioning: ProvisionRegistrationResult;
    try {
      await this.registrations.registerIdentity({
        account,
        user,
        workspaceId,
        session,
      });
      provisioning = await this.workspaceProvisioning.provisionRegistration({
        userId: user.id.value,
        workspaceId,
        warehouseName: input.warehouseName,
      });
    } catch (cause) {
      throw AuthRegistrationUnavailableError(cause);
    }

    return {
      userId: user.id.value,
      sessionSecret: generated.secret,
      expiresAt: session.expiresAt,
      ...provisioning,
    };
  }
}
