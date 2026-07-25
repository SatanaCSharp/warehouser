import { PasswordCredential } from 'auth/domain';

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<PasswordCredential>;
  abstract verify(
    password: string,
    credential: PasswordCredential,
  ): Promise<boolean>;
  abstract dummyVerify(password: string): Promise<void>;
  abstract needsUpgrade(credential: PasswordCredential): boolean;
}
