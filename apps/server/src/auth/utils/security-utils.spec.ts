import { createNodeScryptPasswordHasher } from 'auth/utils/node-scrypt-password-hasher';
import {
  digestSessionSecret,
  generateSessionSecret,
} from 'auth/utils/opaque-session-secrets';

const testParameters = {
  cost: 1_024,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  maxMemory: 4 * 1024 * 1024,
};

describe('auth security utilities', () => {
  it('hashes and verifies the password without storing plaintext', async () => {
    const hasher = createNodeScryptPasswordHasher(testParameters);
    const password = '  exact 🔐 password  ';

    const credential = await hasher.hash(password);

    expect(credential.hash).not.toContain(password);
    expect(credential.algorithm).toBe('scrypt');
    await expect(hasher.verify(password, credential)).resolves.toBe(true);
    await expect(hasher.verify(`${password}!`, credential)).resolves.toBe(
      false,
    );
  });

  it('detects credentials that need a parameter upgrade', async () => {
    const original = createNodeScryptPasswordHasher(testParameters);
    const credential = await original.hash('password');
    const upgraded = createNodeScryptPasswordHasher({
      ...testParameters,
      cost: 2_048,
    });

    expect(original.needsUpgrade(credential)).toBe(false);
    expect(upgraded.needsUpgrade(credential)).toBe(true);
  });

  it('generates unique opaque secrets and stores only their digest', () => {
    const first = generateSessionSecret();
    const second = generateSessionSecret();

    expect(first.secret).not.toBe(second.secret);
    expect(first.digest).toHaveLength(32);
    expect(first.digest.toString('base64url')).not.toBe(first.secret);
    expect(digestSessionSecret(first.secret)).toEqual(first.digest);
  });
});
