import {
  Account,
  AccountId,
  EmailAddress,
  Password,
  Session,
  SessionDigest,
  SessionId,
  toAuthenticatedPrincipal,
  User,
  UserId,
} from 'auth/domain';

describe('auth domain', () => {
  it('normalizes a supported email while preserving its validated shape', () => {
    expect(EmailAddress.create('  Test.User@Example.TEST ').value).toBe(
      'test.user@example.test',
    );
    expect(() => EmailAddress.create('invalid@example')).toThrow(
      'Unsupported email address',
    );
  });

  it('measures password length in Unicode code points and preserves whitespace', () => {
    const password = '  🔐pass  ';

    expect(Password.create(password).value).toBe(password);
    expect(() => Password.create('🔐'.repeat(7))).toThrow(
      'Password must contain 8 to 128 Unicode code points',
    );
    expect(() => Password.create('🔐'.repeat(129))).toThrow(
      'Password must contain 8 to 128 Unicode code points',
    );
  });

  it('requires Account and User to share one identity', () => {
    const identityId = '00000000-0000-4000-8000-000000000001';
    const account = Account.create({
      id: identityId,
      email: 'person@example.test',
      credential: {
        algorithm: 'argon2id',
        hash: 'synthetic-hash',
        parameters: { memoryCost: 19_456 },
      },
    });

    expect(User.forAccount(account).id.value).toBe(identityId);
    expect(account.userId.value).toBe(identityId);
  });

  it('uses fixed 30-day sessions and idempotent revocation', () => {
    const establishedAt = new Date('2026-07-25T10:00:00.000Z');
    const session = Session.establish({
      id: SessionId.create('00000000-0000-4000-8000-000000000002'),
      accountId: AccountId.create('00000000-0000-4000-8000-000000000001'),
      digest: SessionDigest.create(new Uint8Array(32)),
      establishedAt,
    });

    expect(session.expiresAt.toISOString()).toBe('2026-08-24T10:00:00.000Z');
    expect(session.isValid(new Date('2026-08-24T09:59:59.999Z'))).toBe(true);
    expect(session.isValid(session.expiresAt)).toBe(false);

    const revokedAt = new Date('2026-07-26T10:00:00.000Z');
    expect(session.revoke(revokedAt).revoke(revokedAt).revokedAt).toEqual(
      revokedAt,
    );
  });

  it('projects identity without credentials, sessions, or grants', () => {
    expect(
      toAuthenticatedPrincipal(
        UserId.create('00000000-0000-4000-8000-000000000001'),
      ),
    ).toEqual({ userId: '00000000-0000-4000-8000-000000000001' });
  });
});
