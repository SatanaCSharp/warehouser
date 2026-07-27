import {
  hashPassword,
  passwordCredentialNeedsUpgrade,
  verifyPassword,
} from 'auth/domain/security/password';

const testParameters = {
  cost: 1_024,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  maxMemory: 4 * 1024 * 1024,
};

describe('password security', () => {
  it('hashes and verifies the password without storing plaintext', async () => {
    const password = '  exact 🔐 password  ';

    const credential = await hashPassword(password, testParameters);

    expect(credential.hash).not.toContain(password);
    expect(credential.algorithm).toBe('scrypt');
    await expect(verifyPassword(password, credential)).resolves.toBe(true);
    await expect(verifyPassword(`${password}!`, credential)).resolves.toBe(
      false,
    );
  });

  it('detects credentials that need a parameter upgrade', async () => {
    const credential = await hashPassword('password', testParameters);

    expect(passwordCredentialNeedsUpgrade(credential, testParameters)).toBe(
      false,
    );
    expect(
      passwordCredentialNeedsUpgrade(credential, {
        ...testParameters,
        cost: 2_048,
      }),
    ).toBe(true);
  });
});
