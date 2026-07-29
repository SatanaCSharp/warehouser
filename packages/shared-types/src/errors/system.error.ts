export class SystemError extends Error {
  constructor(
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(code);
  }
}
