export interface Clock {
  now(): Date;
}

export interface AuthIdGenerator {
  identityId(): string;
  sessionId(): string;
}
