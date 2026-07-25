import { createHash, randomBytes } from 'node:crypto';

import {
  GeneratedSessionSecret,
  SessionSecrets,
} from 'auth/services/session-secrets';

export class OpaqueSessionSecrets extends SessionSecrets {
  generate(): GeneratedSessionSecret {
    const secret = randomBytes(32).toString('base64url');
    return { secret, digest: this.digest(secret) };
  }

  digest(secret: string): Buffer {
    return createHash('sha256').update(secret, 'utf8').digest();
  }
}
