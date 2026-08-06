import {
  createMemberInputSchema,
  emailChangeInputSchema,
  memberConfirmationSchema,
  memberEmailSchema,
  memberSchema,
  passwordChangeInputSchema,
} from 'users';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

describe('users contracts', () => {
  it('validates a strict create-member request matching CreateMemberInput', () => {
    expect(
      createMemberInputSchema.parse({
        email: 'test.member@example.test',
        password: 'Test password 123',
        roleId: id(3),
      }),
    ).toEqual({
      email: 'test.member@example.test',
      password: 'Test password 123',
      roleId: id(3),
    });

    // missing required field
    expect(
      createMemberInputSchema.safeParse({
        password: 'Test password 123',
        roleId: id(3),
      }).success,
    ).toBe(false);

    // password below the 8 code-point minimum (AC-02 shared rule)
    expect(
      createMemberInputSchema.safeParse({
        email: 'test.member@example.test',
        password: 'short1',
        roleId: id(3),
      }).success,
    ).toBe(false);

    // roleId must be a uuid, not an arbitrary string
    expect(
      createMemberInputSchema.safeParse({
        email: 'test.member@example.test',
        password: 'Test password 123',
        roleId: 'not-a-uuid',
      }).success,
    ).toBe(false);

    // additionalProperties: false in the OpenAPI schema
    expect(
      createMemberInputSchema.safeParse({
        email: 'test.member@example.test',
        password: 'Test password 123',
        roleId: id(3),
        extra: true,
      }).success,
    ).toBe(false);
  });

  it('validates only the safe Member response shape', () => {
    expect(
      memberSchema.parse({
        userId: id(10),
        email: 'test.member@example.test',
        roleId: id(3),
      }),
    ).toEqual({
      userId: id(10),
      email: 'test.member@example.test',
      roleId: id(3),
    });

    expect(
      memberSchema.safeParse({
        userId: id(10),
        email: 'test.member@example.test',
        roleId: id(3),
        password: 'leaked',
      }).success,
    ).toBe(false);
  });

  it('validates a strict email-change request matching EmailChangeInput', () => {
    expect(
      emailChangeInputSchema.parse({ email: 'corrected.member@example.test' }),
    ).toEqual({ email: 'corrected.member@example.test' });

    expect(emailChangeInputSchema.safeParse({}).success).toBe(false);
    expect(
      emailChangeInputSchema.safeParse({
        email: 'corrected.member@example.test',
        userId: id(10),
      }).success,
    ).toBe(false);
  });

  it('validates the strict MemberEmail response shape', () => {
    expect(
      memberEmailSchema.parse({
        userId: id(10),
        email: 'corrected.member@example.test',
      }),
    ).toEqual({ userId: id(10), email: 'corrected.member@example.test' });

    expect(
      memberEmailSchema.safeParse({
        userId: id(10),
        email: 'corrected.member@example.test',
        roleId: id(3),
      }).success,
    ).toBe(false);
  });

  it('validates a strict password-change request matching PasswordChangeInput', () => {
    expect(
      passwordChangeInputSchema.parse({
        password: 'Another test password 456',
      }),
    ).toEqual({ password: 'Another test password 456' });

    // password above the 128 code-point maximum (AC-07 shared rule)
    expect(
      passwordChangeInputSchema.safeParse({ password: 'a'.repeat(129) })
        .success,
    ).toBe(false);
    expect(
      passwordChangeInputSchema.safeParse({
        password: 'Another test password 456',
        email: 'test.member@example.test',
      }).success,
    ).toBe(false);
  });

  it('validates the strict MemberConfirmation response shape', () => {
    expect(memberConfirmationSchema.parse({ userId: id(10) })).toEqual({
      userId: id(10),
    });

    expect(
      memberConfirmationSchema.safeParse({ userId: id(10), email: 'x' })
        .success,
    ).toBe(false);
  });
});
