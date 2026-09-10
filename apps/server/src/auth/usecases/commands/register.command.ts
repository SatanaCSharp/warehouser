import { randomUUID } from 'node:crypto';

import { assert } from '@warehouser/utils/asserts';
import type { AuthRuntime } from 'auth/domain/auth-runtime';
import { authRuntime } from 'auth/domain/auth-runtime';
import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { User } from 'auth/domain/entities/user';
import {
  AuthEmailAlreadyRegisteredError,
  AuthInvalidInputError,
  AuthRegistrationUnavailableError,
} from 'auth/domain/errors/auth.errors';
import type { GeneratedSessionSecret } from 'auth/domain/security/session-secret';
import { generateSessionSecret } from 'auth/domain/security/session-secret';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { EmailAddress } from 'shared/domain/security/email-address';
import { isSupportedEmail } from 'shared/domain/security/is-supported-email';
import { isSupportedPassword } from 'shared/domain/security/is-supported-password';
import { Password } from 'shared/domain/security/password';
import { hashPassword } from 'shared/domain/security/password-hashing';
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
    private readonly hash: typeof hashPassword = hashPassword,
    private readonly generateSecret: () => GeneratedSessionSecret = generateSessionSecret,
    private readonly runtime: AuthRuntime = authRuntime,
  ) {}

  @Transactional()
  async execute(input: RegisterInput): Promise<RegisteredSession> {
    const emailSupported = isSupportedEmail(input.email);
    const passwordSupported = isSupportedPassword(input.password);
    assert(
      emailSupported && passwordSupported,
      AuthInvalidInputError({
        ...(!emailSupported && { email: 'unsupported' }),
        ...(!passwordSupported && { password: 'unsupported' }),
      }),
    );
    const email = EmailAddress.create(input.email);
    const password = Password.create(input.password);

    assert(
      !(await this.authentication.findAccountByNormalizedEmail(email.value)),
      AuthEmailAlreadyRegisteredError(),
    );

    const credential = await this.hash(password.value);
    const account = Account.create({
      id: this.runtime.identityId(),
      email: email.value,
      credential,
    });
    const user = User.forAccount(account);
    const generated = this.generateSecret();
    const session = Session.establish({
      id: SessionId.create(this.runtime.sessionId()),
      accountId: account.id,
      digest: SessionDigest.create(generated.digest),
      establishedAt: this.runtime.now(),
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
