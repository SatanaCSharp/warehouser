import { type ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
  SystemError,
} from '@warehouser/shared-types/errors';
import {
  applicationErrors,
  GlobalHttpExceptionFilter,
  systemErrors,
} from 'shared/errors/global-http-exception.filter';

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
      new ApplicationError(ErrorCode.ACCESS_DENIED),
      403,
      {
        code: 'access.denied',
        message: 'Access is not permitted.',
      },
    ],
    [
      new ApplicationError(ErrorCode.ACCESS_ROLE_NAME_CONFLICT),
      409,
      {
        code: 'access.role_name_conflict',
        message: 'Role names must be unique within the Warehouse.',
      },
    ],
    [
      new ApplicationError(ErrorCode.ACCESS_ROLE_UNAVAILABLE),
      404,
      {
        code: 'access.role_unavailable',
        message: 'The Role is unavailable.',
      },
    ],
    [
      new ApplicationError(ErrorCode.ACCESS_REPLACEMENT_REQUIRED),
      400,
      {
        code: 'access.replacement_required',
        message: 'Select a different custom replacement Role.',
      },
    ],
    [
      new ApplicationError(ErrorCode.ACCESS_CONCURRENT_CHANGE),
      409,
      {
        code: 'access.concurrent_change',
        message: 'Access changed concurrently. Refresh and try again.',
      },
    ],
    [
      new ApplicationError(ErrorCode.AUTH_INVALID_CREDENTIALS),
      401,
      {
        code: 'auth.invalid_credentials',
        message: 'The email or password is incorrect.',
      },
    ],
    [
      new ApplicationError(ErrorCode.USERS_SELF_ACTION_DENIED),
      409,
      {
        code: 'users.self_action_denied',
        message: 'You cannot perform this action on your own account.',
      },
    ],
    [
      new ApplicationError(ErrorCode.USERS_MANAGER_ROLE_PROTECTED),
      409,
      {
        code: 'users.manager_role_protected',
        message:
          'Transfer the Warehouse Manager Role before changing this member.',
      },
    ],
    [
      new ApplicationError(ErrorCode.USERS_PERMISSION_EXCEEDED),
      409,
      {
        code: 'users.permission_exceeded',
        message: "A member's Role can never exceed your own Permissions.",
      },
    ],
    [
      new ApplicationError(ErrorCode.USERS_RESERVED_ROLE_SELECTION),
      409,
      {
        code: 'users.reserved_role_selection',
        message:
          'The Warehouse Manager Role can only be obtained through manager transfer.',
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
      new SystemError(
        ErrorCode.ACCESS_MANAGER_TRANSFER_UNAVAILABLE,
        new Error('database unavailable'),
      ),
      503,
      {
        code: 'access.manager_transfer_unavailable',
        message: 'Manager transfer did not complete.',
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

  it('maps every declared ErrorCode to an HTTP status, except the internal fallback', () => {
    const unmapped = Object.values(ErrorCode).filter(
      (code) =>
        code !== ErrorCode.INTERNAL_ERROR &&
        !(code in applicationErrors) &&
        !(code in systemErrors),
    );

    expect(unmapped).toEqual([]);
  });
});
