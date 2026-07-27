import {
  digestSessionSecret,
  generateSessionSecret,
} from 'auth/domain/security/session-secret';

describe('session secret security', () => {
  it('generates unique opaque secrets and stores only their digest', () => {
    const first = generateSessionSecret();
    const second = generateSessionSecret();

    expect(first.secret).not.toBe(second.secret);
    expect(first.digest).toHaveLength(32);
    expect(first.digest.toString('base64url')).not.toBe(first.secret);
    expect(digestSessionSecret(first.secret)).toEqual(first.digest);
  });
});
