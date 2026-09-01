import { randomUUID } from 'node:crypto';

import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { User } from 'auth/domain/entities/user';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import type { EntityManager } from 'typeorm';

// `AddWorkspaceRelations` (T4) made `users.workspace_id` non-null, so
// `AuthRegistrationService.registerIdentity` can no longer insert a User
// without one. sad.md §6.1/§4 ("the User's Workspace relation is written as
// part of the same outcome") and spec.md §1 (second boundary: "established
// when that User is created ... never re-derived afterwards from their
// Warehouse memberships") put the registrant's Workspace id on the identity
// itself rather than deriving it later. `fk_users_workspace_id` is
// `DEFERRABLE INITIALLY DEFERRED` (see `AddWorkspaceRelations`), so the User
// row may be inserted before the Workspace row exists, as long as both are
// committed in the same transaction — this is the RED for that shape:
// `RegisteredIdentity` does not yet carry `workspaceId` and
// `AuthRegistrationService` does not yet write it, so this suite fails to
// compile/insert until the implementer adds it (T14).
const buildIdentity = (
  email = `${randomUUID()}@example.test`,
  workspaceId = randomUUID(),
) => {
  const id = randomUUID();
  const account = Account.create({
    id,
    email,
    credential: {
      algorithm: 'scrypt',
      hash: 'synthetic-hash',
      parameters: { cost: 1_024, salt: 'synthetic-salt' },
    },
  });
  const user = User.forAccount(account);
  const session = Session.establish({
    id: SessionId.create(randomUUID()),
    accountId: account.id,
    digest: SessionDigest.create(Buffer.alloc(32, 1)),
    establishedAt: new Date('2026-07-25T10:00:00.000Z'),
  });
  return { account, user, workspaceId, session };
};

describe('AuthRegistrationService', () => {
  const transactionContext = new DbTransactionContext(dataSource);
  const transactionService = new DbTransactionService(
    dataSource,
    transactionContext,
  );
  const authenticationRepository = new AuthenticationRepository(dataSource);
  const registrationService = new AuthRegistrationService(
    authenticationRepository,
  );

  // The Workspace row registration bootstrap would create in the same
  // transaction (T14/`workspaces` provisioning) does not exist in this
  // service-only suite, so the fixture seeds it directly through the ambient
  // manager — matching the deferred-FK pattern documented on
  // `workspace-provisioning.repository.integration.spec.ts`'s `seedIdentity`.
  const seedWorkspace = (
    manager: EntityManager,
    workspaceId: string,
  ): Promise<void> =>
    manager.getRepository(WorkspaceEntity).insert({
      id: workspaceId,
      name: null,
      createdAt: new Date('2026-07-25T10:00:00.000Z'),
      updatedAt: new Date('2026-07-25T10:00:00.000Z'),
    }) as unknown as Promise<void>;

  const registerIdentity = (
    identity: ReturnType<typeof buildIdentity>,
  ): Promise<void> =>
    transactionService.executeInTransaction({}, async (manager) => {
      await seedWorkspace(manager, identity.workspaceId);
      await registrationService.registerIdentity(identity);
    });

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE sessions, users, accounts, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('atomically persists one linked Account, User, and Session', async () => {
    const identity = buildIdentity();

    await registerIdentity(identity);

    const rows = await dataSource.query(
      'SELECT (SELECT count(*) FROM accounts) AS accounts, ' +
        '(SELECT count(*) FROM users) AS users, ' +
        '(SELECT count(*) FROM sessions) AS sessions',
    );
    expect(rows[0]).toMatchObject({ accounts: '1', users: '1', sessions: '1' });
  });

  it("writes the registrant's users.workspace_id from the identity at creation (spec.md §1, second boundary)", async () => {
    const identity = buildIdentity();

    await registerIdentity(identity);

    const [row] = await dataSource.query(
      'SELECT workspace_id FROM users WHERE id = $1',
      [identity.user.id.value],
    );
    // No `warehouse_memberships` row exists anywhere in this suite: the
    // value can only have come from the identity itself, never derived from
    // a membership.
    expect(row.workspace_id).toBe(identity.workspaceId);
  });

  it('resolves valid sessions and revokes them idempotently', async () => {
    const identity = buildIdentity();
    await registerIdentity(identity);

    await expect(
      authenticationRepository.findValidSessionByDigest(
        Buffer.from(identity.session.digest.value),
        new Date('2026-07-26T10:00:00.000Z'),
      ),
    ).resolves.not.toBeNull();
    await expect(
      authenticationRepository.revokeSessionByDigest(
        Buffer.from(identity.session.digest.value),
        new Date('2026-07-26T10:00:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(
      authenticationRepository.revokeSessionByDigest(
        Buffer.from(identity.session.digest.value),
        new Date('2026-07-26T10:00:00.000Z'),
      ),
    ).resolves.toBe(false);
  });
});
