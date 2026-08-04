import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  ApplicationError,
  AssertionError,
  SystemError,
} from '@warehouser/shared-types/errors';
import { redactSensitiveValues } from 'shared/errors/sensitive-value-redactor';

interface SafeErrorEnvelope {
  readonly code: string;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

interface ErrorMapping {
  readonly envelope: SafeErrorEnvelope;
  readonly severity: 'error' | 'warn';
  readonly status: number;
}

type ExceptionLogger = Pick<Logger, 'error' | 'warn'>;

const applicationErrors: Readonly<
  Record<string, Omit<ErrorMapping, 'severity'>>
> = {
  [ErrorCode.ACCESS_DENIED]: {
    status: 403,
    envelope: {
      code: ErrorCode.ACCESS_DENIED,
      message: 'Access is not permitted.',
    },
  },
  [ErrorCode.ACCESS_MEMBERSHIP_REQUIRED]: {
    status: 403,
    envelope: {
      code: ErrorCode.ACCESS_MEMBERSHIP_REQUIRED,
      message: 'Warehouse access is unavailable.',
    },
  },
  [ErrorCode.ACCESS_INVALID_ROLE]: {
    status: 400,
    envelope: {
      code: ErrorCode.ACCESS_INVALID_ROLE,
      message: 'Correct the highlighted Role fields.',
    },
  },
  [ErrorCode.ACCESS_ROLE_NAME_CONFLICT]: {
    status: 409,
    envelope: {
      code: ErrorCode.ACCESS_ROLE_NAME_CONFLICT,
      message: 'Role names must be unique within the Warehouse.',
    },
  },
  [ErrorCode.ACCESS_ROLE_UNAVAILABLE]: {
    status: 404,
    envelope: {
      code: ErrorCode.ACCESS_ROLE_UNAVAILABLE,
      message: 'The Role is unavailable.',
    },
  },
  [ErrorCode.ACCESS_TARGET_UNAVAILABLE]: {
    status: 404,
    envelope: {
      code: ErrorCode.ACCESS_TARGET_UNAVAILABLE,
      message: 'The selected member or Role is unavailable.',
    },
  },
  [ErrorCode.ACCESS_PROTECTED_ROLE]: {
    status: 409,
    envelope: {
      code: ErrorCode.ACCESS_PROTECTED_ROLE,
      message: 'The Warehouse Manager Role is system-managed.',
    },
  },
  [ErrorCode.ACCESS_MANAGER_TRANSFER_REQUIRED]: {
    status: 409,
    envelope: {
      code: ErrorCode.ACCESS_MANAGER_TRANSFER_REQUIRED,
      message: 'Use the protected manager-transfer action.',
    },
  },
  [ErrorCode.ACCESS_REPLACEMENT_REQUIRED]: {
    status: 400,
    envelope: {
      code: ErrorCode.ACCESS_REPLACEMENT_REQUIRED,
      message: 'Select a different custom replacement Role.',
    },
  },
  [ErrorCode.ACCESS_INVALID_MANAGER_TRANSFER]: {
    status: 400,
    envelope: {
      code: ErrorCode.ACCESS_INVALID_MANAGER_TRANSFER,
      message: 'Select another member and a valid custom Role.',
    },
  },
  [ErrorCode.ACCESS_CONCURRENT_CHANGE]: {
    status: 409,
    envelope: {
      code: ErrorCode.ACCESS_CONCURRENT_CHANGE,
      message: 'Access changed concurrently. Refresh and try again.',
    },
  },
  [ErrorCode.AUTH_INVALID_INPUT]: {
    status: 400,
    envelope: {
      code: ErrorCode.AUTH_INVALID_INPUT,
      message: 'Correct the highlighted authentication fields.',
    },
  },
  [ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED]: {
    status: 409,
    envelope: {
      code: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED,
      message: 'This email is already registered.',
    },
  },
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: {
    status: 401,
    envelope: {
      code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'The email or password is incorrect.',
    },
  },
};

const systemErrors: Readonly<Record<string, Omit<ErrorMapping, 'severity'>>> = {
  [ErrorCode.ACCESS_ROLE_DELETION_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.ACCESS_ROLE_DELETION_UNAVAILABLE,
      message: 'Role deletion did not complete.',
    },
  },
  [ErrorCode.ACCESS_MANAGER_TRANSFER_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.ACCESS_MANAGER_TRANSFER_UNAVAILABLE,
      message: 'Manager transfer did not complete.',
    },
  },
  [ErrorCode.AUTH_REGISTRATION_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.AUTH_REGISTRATION_UNAVAILABLE,
      message: 'Sign-up did not complete. Try again.',
    },
  },
  [ErrorCode.AUTH_SESSION_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.AUTH_SESSION_UNAVAILABLE,
      message: 'Sign-in could not establish a session. Try again.',
    },
  },
  [ErrorCode.AUTH_SIGN_OUT_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.AUTH_SIGN_OUT_UNAVAILABLE,
      message: 'Sign-out did not complete. Try again.',
    },
  },
};

const internalError: ErrorMapping = {
  status: 500,
  severity: 'error',
  envelope: {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred.',
  },
};

const mapException = (exception: unknown): ErrorMapping => {
  if (exception instanceof ApplicationError) {
    const mapping = applicationErrors[exception.code];

    return mapping === undefined
      ? internalError
      : {
          ...mapping,
          severity: 'warn',
          envelope: {
            ...mapping.envelope,
            ...(exception.details === undefined
              ? {}
              : { details: exception.details }),
          },
        };
  }

  if (exception instanceof SystemError) {
    const mapping = systemErrors[exception.code];

    return mapping === undefined
      ? internalError
      : { ...mapping, severity: 'error' };
  }

  if (exception instanceof HttpException) {
    return {
      status: exception.getStatus(),
      severity: 'warn',
      envelope: {
        code: 'request.invalid',
        message: 'The request is invalid.',
      },
    };
  }

  if (exception instanceof AssertionError) {
    return internalError;
  }

  return internalError;
};

const describeException = (exception: unknown): unknown => {
  if (!(exception instanceof Error)) {
    return { category: 'unknown' };
  }

  return redactSensitiveValues({
    category: exception.constructor.name,
    code:
      exception instanceof ApplicationError || exception instanceof SystemError
        ? exception.code
        : undefined,
    message: exception.message,
    stack: exception.stack,
    cause: exception instanceof SystemError ? exception.cause : undefined,
  });
};

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: ExceptionLogger = new Logger(
      GlobalHttpExceptionFilter.name,
    ),
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{
      headers?: Readonly<Record<string, string | undefined>>;
      method?: string;
      originalUrl?: string;
    }>();
    const response = http.getResponse<{
      status(code: number): { json(body: SafeErrorEnvelope): void };
    }>();
    const mapping = mapException(exception);
    const logEntry = {
      error: describeException(exception),
      method: request.method,
      route: request.originalUrl,
      requestId: request.headers?.['x-request-id'],
    };

    this.logger[mapping.severity](logEntry);
    response.status(mapping.status).json(mapping.envelope);
  }
}
