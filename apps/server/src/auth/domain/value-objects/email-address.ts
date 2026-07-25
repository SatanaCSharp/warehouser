const EMAIL_PATTERN =
  /^(?=[^@]{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;

export class EmailAddress {
  private constructor(readonly value: string) {}

  static create(input: string): EmailAddress {
    const normalized = input.trim().toLowerCase();
    const isAscii = Array.from(normalized).every(
      (character) => character.codePointAt(0)! <= 127,
    );

    if (
      !isAscii ||
      normalized.length > 254 ||
      !EMAIL_PATTERN.test(normalized)
    ) {
      throw new Error('Unsupported email address');
    }

    return new EmailAddress(normalized);
  }
}
