import {
  accountEntityFactory,
  sessionEntityFactory,
  userEntityFactory,
  warehouseMembershipEntityFactory,
} from 'test/factories/entity-factories';

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

describe('accountEntityFactory', () => {
  it('builds a valid DeepPartial<AccountEntity> with a synthetic example.test email', () => {
    const account = accountEntityFactory();

    expect(account.id).toMatch(UUID_V4_PATTERN);
    // Identity-pairing invariant (`chk_accounts_user_identity_pair`): id === userId.
    expect(account.userId).toBe(account.id);
    expect(account.normalizedEmail).toMatch(/^[^@]+@[^@]+\.test$/u);
    expect(account.passwordHash).toEqual(expect.any(String));
    expect((account.passwordHash as string).length).toBeGreaterThan(0);
    expect(account.passwordHashAlgorithm).toBe('scrypt');
    expect(account.passwordHashParameters).toEqual(
      expect.objectContaining({ cost: expect.any(Number) }),
    );
    expect(account.createdAt).toBeInstanceOf(Date);
    expect(account.updatedAt).toBeInstanceOf(Date);
  });

  it('applies overrides while keeping unspecified fields valid', () => {
    const overriddenEmail = 'override.member@example.test';

    const account = accountEntityFactory({ normalizedEmail: overriddenEmail });

    expect(account.normalizedEmail).toBe(overriddenEmail);
    expect(account.id).toMatch(UUID_V4_PATTERN);
  });
});

describe('userEntityFactory', () => {
  it("builds a valid DeepPartial<UserEntity> matching a given AccountEntity's identity", () => {
    const account = accountEntityFactory();

    const user = userEntityFactory(account);

    // Identity-pairing invariant (`chk_users_account_identity_pair`):
    // UserEntity.id === UserEntity.accountId === AccountEntity.id.
    expect(user.id).toBe(account.id);
    expect(user.accountId).toBe(account.id);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it('allows overriding fields after deriving identity from the given Account', () => {
    const account = accountEntityFactory();
    const overriddenCreatedAt = new Date('2026-01-01T00:00:00.000Z');

    const user = userEntityFactory(account, { createdAt: overriddenCreatedAt });

    expect(user.id).toBe(account.id);
    expect(user.createdAt).toBe(overriddenCreatedAt);
  });
});

describe('warehouseMembershipEntityFactory', () => {
  it('builds a valid custom-kind DeepPartial<WarehouseMembershipEntity>', () => {
    const warehouseId = '00000000-0000-4000-8000-000000000101';
    const roleId = '00000000-0000-4000-8000-000000000201';
    const userId = '00000000-0000-4000-8000-000000000301';

    const membership = warehouseMembershipEntityFactory({
      userId,
      warehouseId,
      roleId,
    });

    expect(membership.userId).toBe(userId);
    expect(membership.warehouseId).toBe(warehouseId);
    expect(membership.roleId).toBe(roleId);
    // AC-20: a newly created member is always granted the `custom` role kind,
    // never the reserved `warehouse_manager` kind.
    expect(membership.roleKind).toBe('custom');
    expect(membership.createdAt).toBeInstanceOf(Date);
    expect(membership.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects an attempt to override roleKind to the reserved warehouse_manager kind', () => {
    const membership = warehouseMembershipEntityFactory({
      userId: '00000000-0000-4000-8000-000000000301',
      warehouseId: '00000000-0000-4000-8000-000000000101',
      roleId: '00000000-0000-4000-8000-000000000201',
      roleKind: 'warehouse_manager',
    });

    // Even under an explicit override, the factory must not hand back a
    // membership shape that never legally exists for a created member.
    expect(membership.roleKind).toBe('custom');
  });
});

describe('sessionEntityFactory', () => {
  it('builds a valid, non-revoked DeepPartial<SessionEntity> for a given Account', () => {
    const account = accountEntityFactory();

    const session = sessionEntityFactory(account);

    expect(session.id).toMatch(UUID_V4_PATTERN);
    expect(session.accountId).toBe(account.id);
    expect(Buffer.isBuffer(session.secretDigest)).toBe(true);
    expect((session.secretDigest as Buffer).length).toBeGreaterThan(0);
    expect(session.establishedAt).toBeInstanceOf(Date);
    expect(session.expiresAt).toBeInstanceOf(Date);
    expect(
      (session.expiresAt as Date).getTime() >
        (session.establishedAt as Date).getTime(),
    ).toBe(true);
    expect(session.revokedAt).toBeNull();
  });

  it('allows building an already-revoked Session via overrides', () => {
    const account = accountEntityFactory();
    const revokedAt = new Date('2026-08-06T15:00:00.000Z');

    const session = sessionEntityFactory(account, { revokedAt });

    expect(session.revokedAt).toBe(revokedAt);
  });
});
