import { describe, expect, it } from 'vitest';

import { ApiFailure } from 'shared/api/api-client';
import { getFieldErrors, getTranslatedApiError } from 'shared/errors/api-error';

describe('API error presentation', () => {
  it('maps known codes to translations instead of displaying server messages', () => {
    const translate = (key: string): string => `translated:${key}`;
    const error = new ApiFailure('auth.invalid_credentials', {
      serverMessage: 'unsafe server copy',
    });

    expect(getTranslatedApiError(error, translate)).toBe(
      'translated:errors.auth.invalidCredentials',
    );
  });

  it('maps supported field codes and drops unknown fields and messages', () => {
    const error = new ApiFailure('auth.invalid_input', {
      fieldErrors: {
        email: 'validation.email.invalid',
        password: 'untrusted copy',
        authorization: 'admin',
      },
    });

    expect(getFieldErrors(error)).toEqual({
      email: 'validation.email.invalid',
    });
  });
});
