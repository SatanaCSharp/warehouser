import { createHash, randomBytes } from 'node:crypto';

export interface GeneratedSessionSecret {
  readonly secret: string;
  readonly digest: Buffer;
}

export const digestSessionSecret = (secret: string): Buffer =>
  createHash('sha256').update(secret, 'utf8').digest();

export const generateSessionSecret = (): GeneratedSessionSecret => {
  const secret = randomBytes(32).toString('base64url');
  return { secret, digest: digestSessionSecret(secret) };
};
