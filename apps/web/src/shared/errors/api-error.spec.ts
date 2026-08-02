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
