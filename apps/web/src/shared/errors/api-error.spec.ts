import { describe, expect, it } from 'vitest';

import { getFieldErrors, getTranslatedApiError } from 'shared/errors/api-error';

describe('API error presentation', () => {
  it('maps known codes to translations instead of displaying server messages', () => {
    const translate = (key: string): string => `translated:${key}`;
    const error = { code: 'auth.invalid_credentials' };

    expect(getTranslatedApiError(error, translate)).toBe(
      'translated:auth.invalidCredentials',
    );
  });

  // AC-07/AC-13 (review S1-03) — openapi.yaml documents both Warehouse
  // lifecycle failures as their own 503 codes, and the member is told the
  // change did not complete and their Warehouse is untouched, rather than the
  // generic "Something went wrong" that gives no such assurance.
  it.each([
    [
      'workspace.warehouse_creation_unavailable',
      'workspace.warehouseCreationUnavailable',
    ],
    ['workspace.archival_unavailable', 'workspace.archivalUnavailable'],
  ])('maps %s to its own translated description', (code, key) => {
    const translate = (translationKey: string): string =>
      `translated:${translationKey}`;

    expect(getTranslatedApiError({ code }, translate)).toBe(
      `translated:${key}`,
    );
  });

  it('maps supported field codes and drops unknown fields and messages', () => {
    const error = {
      code: 'auth.invalid_input',
      fieldErrors: {
        email: 'validation.email.invalid',
        password: 'untrusted copy',
        authorization: 'admin',
      },
    };

    expect(getFieldErrors(error)).toEqual({
      email: 'validation.email.invalid',
    });
  });
});
