import { type ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
  SystemError,
} from '@warehouser/shared-types/errors';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';

const createHost = () => {
  const status = jest.fn().mockReturnThis();
  const json = jest.fn();
  const request = {
    headers: {
      cookie: 'warehouser_session=opaque-secret',
      authorization: 'Bearer secret',
    },
    body: {
      email: 'person@example.test',
      password: 'secret-password',
    },
    method: 'POST',
    originalUrl: '/api/v1/auth/sign-in',
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status, json }),
    }),
  } as ArgumentsHost;

  return { host, json, status };
};

describe('GlobalHttpExceptionFilter', () => {
  const logger = { error: jest.fn(), warn: jest.fn() };
  const filter = new GlobalHttpExceptionFilter(logger);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    [
      new ApplicationError(ErrorCode.AUTH_INVALID_CREDENTIALS),
      401,
      {
        code: 'auth.invalid_credentials',
        message: 'The email or password is incorrect.',
      },
    ],
    [
      new SystemError(
        ErrorCode.AUTH_SESSION_UNAVAILABLE,
        new Error('database rejected person@example.test passwordHash abc'),
      ),
      503,
      {
        code: 'auth.session_unavailable',
        message: 'Sign-in could not establish a session. Try again.',
      },
    ],
    [
      new AssertionError('password secret-password violated an invariant'),
      500,
      {
        code: 'system.internal_error',
        message: 'An unexpected error occurred.',
      },
    ],
    [
      new BadRequestException('unsafe validation text'),
      400,
      {
        code: 'request.invalid',
        message: 'The request is invalid.',
      },
    ],
    [
      new Error('person@example.test cookie=opaque-secret'),
      500,
      {
        code: 'system.internal_error',
        message: 'An unexpected error occurred.',
      },
    ],
  ])('maps %p to a safe shared envelope', (exception, statusCode, envelope) => {
    const { host, json, status } = createHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(statusCode);
    expect(json).toHaveBeenCalledWith(envelope);
    const logged = JSON.stringify([
      ...logger.error.mock.calls,
      ...logger.warn.mock.calls,
    ]);
    expect(logged).not.toMatch(
      /secret-password|opaque-secret|person@example\.test|passwordHash abc/u,
    );
  });
});
