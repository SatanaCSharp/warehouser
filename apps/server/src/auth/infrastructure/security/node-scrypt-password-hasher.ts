import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

import { PasswordCredential } from 'auth/domain';
import { PasswordHasher } from 'auth/services/password-hasher';

export interface ScryptParameters {
  readonly cost: number;
  readonly blockSize: number;
  readonly parallelization: number;
  readonly keyLength: number;
  readonly maxMemory: number;
}

export const productionScryptParameters: ScryptParameters = {
  cost: 131_072,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  maxMemory: 256 * 1024 * 1024,
};

const derive = (
  password: string,
  salt: Buffer,
  parameters: ScryptParameters,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      parameters.keyLength,
      {
        N: parameters.cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: parameters.maxMemory,
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(key);
      },
    );
  });

export class NodeScryptPasswordHasher extends PasswordHasher {
  constructor(
    private readonly parameters: ScryptParameters = productionScryptParameters,
  ) {
    super();
  }

  async hash(password: string): Promise<PasswordCredential> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, this.parameters);

    return {
      algorithm: 'scrypt',
      hash: key.toString('base64'),
      parameters: {
        ...this.parameters,
        salt: salt.toString('base64'),
      },
    };
  }

  async verify(
    password: string,
    credential: PasswordCredential,
  ): Promise<boolean> {
    if (credential.algorithm !== 'scrypt') {
      return false;
    }

    const parameters = this.readParameters(credential);
    const actual = await derive(
      password,
      Buffer.from(String(credential.parameters.salt), 'base64'),
      parameters,
    );
    const expected = Buffer.from(credential.hash, 'base64');

    return (
      actual.byteLength === expected.byteLength &&
      timingSafeEqual(actual, expected)
    );
  }

  async dummyVerify(password: string): Promise<void> {
    await derive(password, Buffer.alloc(16), this.parameters);
  }

  needsUpgrade(credential: PasswordCredential): boolean {
    if (credential.algorithm !== 'scrypt') {
      return true;
    }

    const stored = this.readParameters(credential);
    return Object.entries(this.parameters).some(
      ([key, value]) => stored[key as keyof ScryptParameters] !== value,
    );
  }

  private readParameters(credential: PasswordCredential): ScryptParameters {
    return {
      cost: Number(credential.parameters.cost),
      blockSize: Number(credential.parameters.blockSize),
      parallelization: Number(credential.parameters.parallelization),
      keyLength: Number(credential.parameters.keyLength),
      maxMemory: Number(credential.parameters.maxMemory),
    };
  }
}
