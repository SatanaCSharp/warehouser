export class Password {
  private constructor(readonly value: string) {}

  static create(value: string): Password {
    const codePointLength = Array.from(value).length;

    if (codePointLength < 8 || codePointLength > 128) {
      throw new Error('Password must contain 8 to 128 Unicode code points');
    }

    return new Password(value);
  }
}
