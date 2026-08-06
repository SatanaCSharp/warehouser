import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export interface PasswordCredential {
  readonly algorithm: string;
  readonly hash: string;
  readonly parameters: Readonly<Record<string, number | string>>;
}

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

const readParameters = (credential: PasswordCredential): ScryptParameters => ({
  cost: Number(credential.parameters.cost),
  blockSize: Number(credential.parameters.blockSize),
  parallelization: Number(credential.parameters.parallelization),
  keyLength: Number(credential.parameters.keyLength),
  maxMemory: Number(credential.parameters.maxMemory),
});

export const hashPassword = async (
  password: string,
  parameters: ScryptParameters = productionScryptParameters,
): Promise<PasswordCredential> => {
  const salt = randomBytes(16);
  const key = await derive(password, salt, parameters);

  return {
    algorithm: 'scrypt',
    hash: key.toString('base64'),
    parameters: { ...parameters, salt: salt.toString('base64') },
  };
};

export const verifyPassword = async (
  password: string,
  credential: PasswordCredential,
): Promise<boolean> => {
  if (credential.algorithm !== 'scrypt') {
    return false;
  }

  const actual = await derive(
    password,
    Buffer.from(String(credential.parameters.salt), 'base64'),
    readParameters(credential),
  );
  const expected = Buffer.from(credential.hash, 'base64');

  return (
    actual.byteLength === expected.byteLength &&
    timingSafeEqual(actual, expected)
  );
};

export const dummyVerifyPassword = async (
  password: string,
  parameters: ScryptParameters = productionScryptParameters,
): Promise<void> => {
  await derive(password, Buffer.alloc(16), parameters);
};
