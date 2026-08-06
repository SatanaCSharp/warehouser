import {
  exceedsActorPermissions,
  isProtectedManagerTarget,
  isReservedManagerRoleSelection,
  isSelfAction,
} from 'users/domain/predicates/member-lifecycle.predicates';

const actorId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';

describe('isSelfAction', () => {
  // AC-11 (self-deletion), AC-18 (self email/password change)
  it('is true when the actor and target are the same identity', () => {
    expect(isSelfAction(actorId, actorId)).toBe(true);
  });

  it('is false when the actor and target are different identities', () => {
    expect(isSelfAction(actorId, targetId)).toBe(false);
  });
});

describe('isProtectedManagerTarget', () => {
  // AC-13 (protected-Manager deletion), AC-14 (protected-Manager credential change)
  it('is true when the target currently holds the Warehouse Manager Role', () => {
    expect(isProtectedManagerTarget('warehouse_manager')).toBe(true);
  });

  it('is false when the target holds a custom Role', () => {
    expect(isProtectedManagerTarget('custom')).toBe(false);
  });
});

describe('exceedsActorPermissions', () => {
  // AC-16 (creation direction — selected Role vs. creator's own Permissions)
  it('is true when the candidate Permission set includes a Permission the actor lacks', () => {
    expect(
      exceedsActorPermissions(
        ['USERS:CREATE'],
        ['USERS:CREATE', 'USERS:DELETE'],
      ),
    ).toBe(true);
  });

  it('is false when the candidate Permission set is a subset of the actor own Permissions', () => {
    expect(
      exceedsActorPermissions(
        ['USERS:CREATE', 'USERS:DELETE'],
        ['USERS:CREATE'],
      ),
    ).toBe(false);
  });

  // AC-19 (credential-change direction — target's Role vs. actor's own Permissions); same
  // predicate, reused symmetrically for both directions per sad.md §4.
  it('is true when the target Role holds a Permission the actor does not currently hold', () => {
    expect(
      exceedsActorPermissions(
        ['USERS:EMAIL_UPDATE'],
        ['USERS:EMAIL_UPDATE', 'USERS:PASSWORD_CHANGE'],
      ),
    ).toBe(true);
  });

  it('is false when every target Role Permission is held by the actor', () => {
    expect(exceedsActorPermissions(['USERS:EMAIL_UPDATE'], [])).toBe(false);
  });
});

describe('isReservedManagerRoleSelection', () => {
  // AC-20 (reserved Warehouse Manager Role selection at creation)
  it('is true when the selected Role is the reserved Warehouse Manager Role', () => {
    expect(isReservedManagerRoleSelection('warehouse_manager')).toBe(true);
  });

  it('is false when the selected Role is a custom Role', () => {
    expect(isReservedManagerRoleSelection('custom')).toBe(false);
  });
});
