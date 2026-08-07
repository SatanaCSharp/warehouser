import {
  CreateMemberDto,
  EmailChangeDto,
  PasswordChangeDto,
} from 'users/rest/dtos/users-mutation.dto';

// DoD (T13): "each endpoint validates the shared Zod schema and returns `400`
// on a malformed body" — these DTOs wrap the T7 contracts
// (`createMemberInputSchema`, `emailChangeInputSchema`,
// `passwordChangeInputSchema`) via `createZodDto`, exactly as
// `access-mutation.dto.ts` wraps `access`'s schemas. `create()` throws a
// ZodError synchronously on invalid input, which the global `ZodValidationPipe`
// (registered in `main.ts`) turns into a 400 response.

const validId = '00000000-0000-4000-8000-000000000003';

describe('CreateMemberDto', () => {
  it('accepts a well-formed create-member body', () => {
    expect(() =>
      CreateMemberDto.create({
        email: 'test.member@example.test',
        password: 'Test password 123',
        roleId: validId,
      }),
    ).not.toThrow();
  });

  it('rejects an invalid email (AC-02)', () => {
    expect(() =>
      CreateMemberDto.create({
        email: 'not-an-email',
        password: 'Test password 123',
        roleId: validId,
      }),
    ).toThrow();
  });

  it('rejects a password shorter than 8 code points (AC-02)', () => {
    expect(() =>
      CreateMemberDto.create({
        email: 'test.member@example.test',
        password: 'short',
        roleId: validId,
      }),
    ).toThrow();
  });

  it('rejects an unexpected extra field (strict schema)', () => {
    expect(() =>
      CreateMemberDto.create({
        email: 'test.member@example.test',
        password: 'Test password 123',
        roleId: validId,
        displayName: 'Not a real field',
      }),
    ).toThrow();
  });
});

describe('EmailChangeDto', () => {
  it('accepts a well-formed email-change body', () => {
    expect(() =>
      EmailChangeDto.create({ email: 'corrected.member@example.test' }),
    ).not.toThrow();
  });

  it('rejects an invalid email (AC-02 rules reused)', () => {
    expect(() => EmailChangeDto.create({ email: 'nope' })).toThrow();
  });
});

describe('PasswordChangeDto', () => {
  it('accepts a well-formed password-change body', () => {
    expect(() =>
      PasswordChangeDto.create({ password: 'Another test password 456' }),
    ).not.toThrow();
  });

  it('rejects a password outside the accepted length (AC-07)', () => {
    expect(() => PasswordChangeDto.create({ password: 'short' })).toThrow();
  });
});
