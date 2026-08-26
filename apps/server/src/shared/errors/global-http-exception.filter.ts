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

export const applicationErrors: Readonly<
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
  [ErrorCode.USERS_SELF_ACTION_DENIED]: {
    status: 409,
    envelope: {
      code: ErrorCode.USERS_SELF_ACTION_DENIED,
      message: 'You cannot perform this action on your own account.',
    },
  },
  [ErrorCode.USERS_MANAGER_ROLE_PROTECTED]: {
    status: 409,
    envelope: {
      code: ErrorCode.USERS_MANAGER_ROLE_PROTECTED,
      message:
        'Transfer the Warehouse Manager Role before changing this member.',
    },
  },
  [ErrorCode.USERS_PERMISSION_EXCEEDED]: {
    status: 409,
    envelope: {
      code: ErrorCode.USERS_PERMISSION_EXCEEDED,
      message: "A member's Role can never exceed your own Permissions.",
    },
  },
  [ErrorCode.USERS_RESERVED_ROLE_SELECTION]: {
    status: 409,
    envelope: {
      code: ErrorCode.USERS_RESERVED_ROLE_SELECTION,
      message:
        'The Warehouse Manager Role can only be obtained through manager transfer.',
    },
  },
  [ErrorCode.WORKSPACE_DENIED]: {
    status: 403,
    envelope: {
      code: ErrorCode.WORKSPACE_DENIED,
      message: 'Access is not permitted.',
    },
  },
  [ErrorCode.WORKSPACE_INVALID_INPUT]: {
    status: 400,
    envelope: {
      code: ErrorCode.WORKSPACE_INVALID_INPUT,
      message: 'Correct the highlighted Workspace fields.',
    },
  },
  [ErrorCode.WORKSPACE_TARGET_UNAVAILABLE]: {
    status: 404,
    envelope: {
      code: ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
      message: 'The selected Workspace target is unavailable.',
    },
  },
  [ErrorCode.WORKSPACE_ROLE_NAME_CONFLICT]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_ROLE_NAME_CONFLICT,
      message: 'Workspace Role names must be unique within the Workspace.',
    },
  },
  [ErrorCode.WORKSPACE_PROTECTED_ROLE]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_PROTECTED_ROLE,
      message: 'The Workspace Owner Role is system-managed.',
    },
  },
  [ErrorCode.WORKSPACE_SYSTEM_MANAGED_PERMISSION]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_SYSTEM_MANAGED_PERMISSION,
      message: 'Workspace Permission definitions are system-managed.',
    },
  },
  [ErrorCode.WORKSPACE_OWNER_TRANSFER_REQUIRED]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_OWNER_TRANSFER_REQUIRED,
      message: 'Use the protected owner-transfer action.',
    },
  },
  [ErrorCode.WORKSPACE_ROLE_ASSIGNMENT_REQUIRED]: {
    status: 403,
    envelope: {
      code: ErrorCode.WORKSPACE_ROLE_ASSIGNMENT_REQUIRED,
      message: 'You do not have permission to assign this Workspace Role.',
    },
  },
  [ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED]: {
    status: 400,
    envelope: {
      code: ErrorCode.WORKSPACE_REPLACEMENT_ROLE_REQUIRED,
      message: 'Select a different custom replacement Workspace Role.',
    },
  },
  [ErrorCode.WORKSPACE_MEMBER_EXISTS]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_MEMBER_EXISTS,
      message: 'This candidate is already a Workspace Member.',
    },
  },
  [ErrorCode.WORKSPACE_WAREHOUSE_MEMBERSHIP_REQUIRED]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_WAREHOUSE_MEMBERSHIP_REQUIRED,
      message: 'The candidate needs a Warehouse membership first.',
    },
  },
  [ErrorCode.WORKSPACE_SELF_ACTION_DENIED]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_SELF_ACTION_DENIED,
      message: 'You cannot perform this action on your own account.',
    },
  },
  [ErrorCode.WORKSPACE_MANAGER_TRANSFER_REQUIRED]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_MANAGER_TRANSFER_REQUIRED,
      message:
        'Transfer the Warehouse Manager Role before changing this member.',
    },
  },
  [ErrorCode.WORKSPACE_MEMBERSHIP_EXISTS]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_MEMBERSHIP_EXISTS,
      message: 'This member already has a Role in this Warehouse.',
    },
  },
  [ErrorCode.WORKSPACE_WAREHOUSE_ARCHIVED]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_WAREHOUSE_ARCHIVED,
      message: 'The Warehouse is archived.',
    },
  },
  [ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_LAST_UNARCHIVED_WAREHOUSE,
      message: 'At least one Warehouse must remain unarchived.',
    },
  },
  [ErrorCode.WORKSPACE_CONCURRENT_CHANGE]: {
    status: 409,
    envelope: {
      code: ErrorCode.WORKSPACE_CONCURRENT_CHANGE,
      message: 'Workspace changed concurrently. Refresh and try again.',
    },
  },
  [ErrorCode.ACCESS_WAREHOUSE_ARCHIVED]: {
    status: 409,
    envelope: {
      code: ErrorCode.ACCESS_WAREHOUSE_ARCHIVED,
      message: 'The Warehouse is archived.',
    },
  },
  [ErrorCode.ACCESS_WRITE_RATE_LIMITED]: {
    status: 429,
    envelope: {
      code: ErrorCode.ACCESS_WRITE_RATE_LIMITED,
      message: 'Too many changes recorded. Try again shortly.',
    },
  },
  [ErrorCode.ITEMS_INVALID_INPUT]: {
    status: 400,
    envelope: {
      code: ErrorCode.ITEMS_INVALID_INPUT,
      message: 'Correct the highlighted Item fields.',
    },
  },
  [ErrorCode.ITEMS_INVALID_ON_HAND_QUANTITY]: {
    status: 400,
    envelope: {
      code: ErrorCode.ITEMS_INVALID_ON_HAND_QUANTITY,
      message: 'On-hand Quantity is a whole number that is never negative.',
    },
  },
  [ErrorCode.ITEMS_ADJUSTMENT_REASON_REQUIRED]: {
    status: 400,
    envelope: {
      code: ErrorCode.ITEMS_ADJUSTMENT_REASON_REQUIRED,
      message: 'Every change to On-hand Quantity is recorded with its reason.',
    },
  },
  [ErrorCode.ITEMS_TARGET_UNAVAILABLE]: {
    status: 404,
    envelope: {
      code: ErrorCode.ITEMS_TARGET_UNAVAILABLE,
      message: 'The selected Item is unavailable.',
    },
  },
  [ErrorCode.ITEMS_SKU_TAKEN]: {
    status: 409,
    envelope: {
      code: ErrorCode.ITEMS_SKU_TAKEN,
      message: 'A SKU identifies at most one Item within a Warehouse.',
    },
  },
  [ErrorCode.ITEMS_SKU_FIXED]: {
    status: 409,
    envelope: {
      code: ErrorCode.ITEMS_SKU_FIXED,
      message:
        'A SKU stops being correctable once demand or a draft names the Item.',
    },
  },
  [ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT]: {
    status: 400,
    envelope: {
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_INPUT,
      message: 'Correct the highlighted Customer Order fields.',
    },
  },
  [ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST]: {
    status: 400,
    envelope: {
      code: ErrorCode.CUSTOMER_ORDERS_NEEDED_BY_IN_PAST,
      message:
        'A customer cannot be recorded as waiting for a date in the past.',
    },
  },
  [ErrorCode.CUSTOMER_ORDERS_TARGET_UNAVAILABLE]: {
    status: 404,
    envelope: {
      code: ErrorCode.CUSTOMER_ORDERS_TARGET_UNAVAILABLE,
      message: 'The selected Customer Order is unavailable.',
    },
  },
  [ErrorCode.CUSTOMER_ORDERS_QUANTITY_BELOW_ALLOCATED]: {
    status: 409,
    envelope: {
      code: ErrorCode.CUSTOMER_ORDERS_QUANTITY_BELOW_ALLOCATED,
      message:
        "A customer's order cannot be reduced below the goods already attributed to them.",
    },
  },
  [ErrorCode.CUSTOMER_ORDERS_INVALID_STATE]: {
    status: 409,
    envelope: {
      code: ErrorCode.CUSTOMER_ORDERS_INVALID_STATE,
      message:
        'The Customer Order is not in a state this change is permitted from.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_UNKNOWN_PACKAGING_TYPE]: {
    status: 400,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_UNKNOWN_PACKAGING_TYPE,
      message: 'Choose a Packaging Type from the catalogue.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT]: {
    status: 400,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_INPUT,
      message: 'Correct the highlighted Purchase Draft fields.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE]: {
    status: 404,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_TARGET_UNAVAILABLE,
      message: 'The selected Purchase Draft is unavailable.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN]: {
    status: 409,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_FROZEN,
      message: 'A draft is frozen once it is ready.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_DISCARD_UNAVAILABLE]: {
    status: 409,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_DISCARD_UNAVAILABLE,
      message:
        'A draft that has been made ready is closed with a reason rather than discarded.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_LINK_EXISTS]: {
    status: 409,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_LINK_EXISTS,
      message: 'This line is already linked to that Customer Order.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_DRAFT_EMPTY]: {
    status: 409,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_DRAFT_EMPTY,
      message: 'A draft is only ready once it says what is being ordered.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_INVALID_STATE]: {
    status: 409,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_INVALID_STATE,
      message:
        'The Purchase Draft is not in a state this transition is permitted from.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE]: {
    status: 409,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_CONCURRENT_CHANGE,
      message:
        'Another member changed this Purchase Draft. Reload and try again.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_ARRIVAL_ALREADY_CONFIRMED]: {
    status: 409,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_ARRIVAL_ALREADY_CONFIRMED,
      message: 'Confirming an arrival closes a draft once and for all.',
    },
  },
  [ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS]: {
    status: 409,
    envelope: {
      code: ErrorCode.PURCHASE_DRAFTS_ALLOCATION_OUT_OF_BOUNDS,
      message:
        'The confirmation was not recorded. Correct the assignments it will not accept.',
    },
  },
};

export const systemErrors: Readonly<
  Record<string, Omit<ErrorMapping, 'severity'>>
> = {
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
  [ErrorCode.USERS_CREATION_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.USERS_CREATION_UNAVAILABLE,
      message: 'Member creation did not complete. Try again.',
    },
  },
  [ErrorCode.USERS_PASSWORD_CHANGE_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.USERS_PASSWORD_CHANGE_UNAVAILABLE,
      message: 'Password change did not complete. Try again.',
    },
  },
  [ErrorCode.USERS_DELETION_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.USERS_DELETION_UNAVAILABLE,
      message: 'Member deletion did not complete. Try again.',
    },
  },
  [ErrorCode.WORKSPACE_WAREHOUSE_CREATION_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.WORKSPACE_WAREHOUSE_CREATION_UNAVAILABLE,
      message: 'Warehouse creation did not complete. Try again.',
    },
  },
  [ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE,
      message: 'Warehouse archival did not complete. Try again.',
    },
  },
  [ErrorCode.WORKSPACE_ROLE_DELETION_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.WORKSPACE_ROLE_DELETION_UNAVAILABLE,
      message: 'Workspace Role deletion did not complete.',
    },
  },
  [ErrorCode.WORKSPACE_OWNER_TRANSFER_UNAVAILABLE]: {
    status: 503,
    envelope: {
      code: ErrorCode.WORKSPACE_OWNER_TRANSFER_UNAVAILABLE,
      message: 'Owner transfer did not complete.',
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
