export interface GeneratedSessionSecret {
  readonly secret: string;
  readonly digest: Buffer;
}

export abstract class SessionSecrets {
  abstract generate(): GeneratedSessionSecret;
  abstract digest(secret: string): Buffer;
}
