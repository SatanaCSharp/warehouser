import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
  SystemError,
} from '@warehouser/shared-types/errors';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  applicationErrors,
  GlobalHttpExceptionFilter,
  systemErrors,
} from 'shared/errors/global-http-exception.filter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const createHost = (
  body: unknown = {
    email: 'person@example.test',
    password: 'secret-password',
  },
) => {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const request = {
    headers: {
      cookie: 'warehouser_session=opaque-secret',
      authorization: 'Bearer secret',
    },
    body,
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
  const logger = { error: vi.fn(), warn: vi.fn() };
  const filter = new GlobalHttpExceptionFilter(logger);

  beforeEach(() => vi.clearAllMocks());

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

  it('leaves a non-Zod HttpException carrying no details', () => {
    const { host, json } = createHost();

    filter.catch(new BadRequestException({ message: 'unsafe text' }), host);

    expect(json).toHaveBeenCalledWith({
      code: 'request.invalid',
      message: 'The request is invalid.',
    });
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

describe('GlobalHttpExceptionFilter on a Zod request-validation refusal', () => {
  const filter = new GlobalHttpExceptionFilter({
    error: vi.fn(),
    warn: vi.fn(),
  });

  // The shape a recorded demand arrives in — an identifier, a customer name, a
  // whole-number quantity with a floor, and a calendar date — so the envelope
  // asserted here is the one `POST .../customer-orders` returns (AC-02).
  const customerOrderCreate = z.strictObject({
    itemId: z.uuid(),
    customerName: z.string().min(1),
    quantity: z.number().int().min(1),
    neededBy: z.iso.date(),
  });

  const refuse = (body: unknown): unknown => {
    try {
      new ZodValidationPipe(customerOrderCreate).transform(body, {
        type: 'body',
      });
    } catch (exception) {
      return exception;
    }

    throw new Error('The schema accepted a body the test expected refused');
  };

  it('names each refused field beside the unchanged envelope', () => {
    const body = {
      itemId: '9c1f0a3e-0000-4000-8000-000000000000',
      customerName: '',
      quantity: 0,
      neededBy: '31-08-2026',
    };
    const { host, json, status } = createHost(body);

    filter.catch(refuse(body), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 'request.invalid',
      message: 'The request is invalid.',
      details: {
        fields: {
          customerName: 'tooSmall',
          quantity: 'tooSmall',
          neededBy: 'invalid',
        },
      },
    });
  });

  it('discloses no supplied value, expectation, or schema message', () => {
    const body = {
      itemId: 'person@example.test',
      customerName: 'secret-password',
      quantity: 7.5,
    };
    const { host, json } = createHost(body);

    filter.catch(refuse(body), host);

    const responded = JSON.stringify(json.mock.calls);
    expect(responded).not.toMatch(
      /person@example\.test|secret-password|7\.5|expected|received|uuid|Invalid input/u,
    );
    expect(responded).toContain('"itemId":"invalid"');
    expect(responded).toContain('"neededBy":"required"');
  });
});
