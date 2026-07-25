import {
  NodeScryptPasswordHasher,
  OpaqueSessionSecrets,
} from 'auth/infrastructure/security';

const testParameters = {
  cost: 1_024,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  maxMemory: 4 * 1024 * 1024,
};

describe('auth security adapters', () => {
  it('hashes and verifies the password without storing plaintext', async () => {
    const hasher = new NodeScryptPasswordHasher(testParameters);
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
    const original = new NodeScryptPasswordHasher(testParameters);
    const credential = await original.hash('password');
    const upgraded = new NodeScryptPasswordHasher({
      ...testParameters,
      cost: 2_048,
    });

    expect(original.needsUpgrade(credential)).toBe(false);
    expect(upgraded.needsUpgrade(credential)).toBe(true);
  });

  it('generates unique opaque secrets and stores only their digest', () => {
    const secrets = new OpaqueSessionSecrets();
    const first = secrets.generate();
    const second = secrets.generate();

    expect(first.secret).not.toBe(second.secret);
    expect(first.digest).toHaveLength(32);
    expect(first.digest.toString('base64url')).not.toBe(first.secret);
    expect(secrets.digest(first.secret)).toEqual(first.digest);
  });
});
