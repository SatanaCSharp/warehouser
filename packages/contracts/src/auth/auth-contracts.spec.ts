import {
  authCredentialsSchema,
  authenticatedUserSchema,
  errorResponseSchema,
  registrationInputSchema,
  registrationResultSchema,
} from 'auth';
import { describe, expect, it } from 'vitest';

describe('auth contracts', () => {
  it('normalizes email and preserves the password exactly', () => {
    const password = '  🔐pass  ';

    expect(
      authCredentialsSchema.parse({
        email: '  Test.User@Example.TEST ',
        password,
      }),
    ).toEqual({ email: 'test.user@example.test', password });
  });

  it('measures passwords in Unicode code points', () => {
    expect(
      authCredentialsSchema.safeParse({
        email: 'person@example.test',
        password: '🔐'.repeat(8),
      }).success,
    ).toBe(true);
    expect(
      authCredentialsSchema.safeParse({
        email: 'person@example.test',
        password: '🔐'.repeat(129),
      }).success,
    ).toBe(false);
  });

  it('rejects unsupported emails and unknown request fields', () => {
    expect(
      authCredentialsSchema.safeParse({
        email: 'person@example',
        password: 'password',
      }).success,
    ).toBe(false);
    expect(
      authCredentialsSchema.safeParse({
        email: 'person@example.test',
        password: 'password',
        authorization: ['admin'],
      }).success,
    ).toBe(false);
  });

  it('exposes only the authenticated user identifier', () => {
    expect(
      authenticatedUserSchema.parse({
        user: { id: '00000000-0000-4000-8000-000000000001' },
      }),
    ).toEqual({
      user: { id: '00000000-0000-4000-8000-000000000001' },
    });
  });

  it('accepts only stable safe error envelopes', () => {
    expect(
      errorResponseSchema.safeParse({
        code: 'auth.invalid_credentials',
        message: 'The email or password is incorrect.',
        details: { fields: { email: 'Correct this field.' } },
      }).success,
    ).toBe(true);
    expect(
      errorResponseSchema.safeParse({
        code: 'InvalidCredentials',
        message: 'unsafe',
        stack: 'secret',
      }).success,
    ).toBe(false);
  });

  it('accepts a trimmed Unicode Warehouse name without normalizing it', () => {
    expect(
      registrationInputSchema.parse({
        email: 'person@example.test',
        password: 'password',
        warehouseName: '  Склад e\u0301  ',
      }),
    ).toEqual({
      email: 'person@example.test',
      password: 'password',
      warehouseName: 'Склад e\u0301',
    });
  });

  it.each([
    ['', 'empty'],
    ['a'.repeat(101), 'overlong'],
    ['Warehouse\u200B', 'format character'],
    ['Ware\nhouse', 'control character'],
  ])('rejects an %s Warehouse name (%s)', (warehouseName) => {
    expect(
      registrationInputSchema.safeParse({
        email: 'person@example.test',
        password: 'password',
        warehouseName,
      }).success,
    ).toBe(false);
  });

  // RED for T53/AC-01 (review S1-04) — openapi.yaml's `RegistrationResult`
  // requires `[user, workspace, workspacePermissionIds, access,
  // effectiveWarehouseId]`, and `WarehouseAccessProjection` requires
  // `archivedAt`. Registration returns the initial Workspace projection
  // alongside the Warehouse one precisely so the shell needs no second round
  // trip; the schema was never extended past `{user, access}`, so the fields
  // `RegisterCommand` already computes were dropped at the boundary.
  const registrationResult = {
    user: { id: '00000000-0000-4000-8000-000000000001' },
    workspace: { id: '00000000-0000-4000-8000-000000000004', name: null },
    workspacePermissionIds: ['WORKSPACE:RENAME', 'WAREHOUSES:CREATE'],
    access: {
      warehouseId: '00000000-0000-4000-8000-000000000002',
      roleId: '00000000-0000-4000-8000-000000000003',
      roleKind: 'warehouse_manager',
      permissionIds: ['ROLES:WATCH'],
      archivedAt: null,
    },
    effectiveWarehouseId: '00000000-0000-4000-8000-000000000002',
  };

  it('validates the immediate Workspace and access projection returned by registration', () => {
    expect(registrationResultSchema.parse(registrationResult)).toEqual(
      registrationResult,
    );
  });

  // The sole Warehouse membership registration creates is the effective
  // selection with no one choosing (AC-03b), so the field is never absent
  // here — an optional one would let the shell fall back to "nothing
  // selected" and render the AC-03b empty state to a member who has a
  // Warehouse.
  const without = <T extends object>(source: T, field: string): object =>
    Object.fromEntries(Object.entries(source).filter(([key]) => key !== field));

  it.each(['workspace', 'workspacePermissionIds', 'effectiveWarehouseId'])(
    'requires %s on the registration result',
    (field) => {
      expect(
        registrationResultSchema.safeParse(without(registrationResult, field))
          .success,
      ).toBe(false);
    },
  );

  it('requires the archived state on the registration access projection', () => {
    expect(
      registrationResultSchema.safeParse({
        ...registrationResult,
        access: without(registrationResult.access, 'archivedAt'),
      }).success,
    ).toBe(false);
  });
});
