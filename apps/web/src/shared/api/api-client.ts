import { errorResponseSchema } from '@warehouser/contracts/auth';

import type { ZodType } from 'zod';

export class ApiFailure extends Error {
  readonly code: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: string,
    options: {
      cause?: unknown;
      fieldErrors?: Record<string, string>;
      serverMessage?: string;
    } = {},
  ) {
    super(options.serverMessage ?? code, { cause: options.cause });
    this.name = 'ApiFailure';
    this.code = code;
    this.fieldErrors = options.fieldErrors;
  }
}

const extractFieldErrors = (
  details: Record<string, unknown> | undefined,
): Record<string, string> | undefined => {
  const fields = details?.fields;
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
    return undefined;
  }

  const entries = Object.entries(fields).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export const request = async <Output>(
  path: string,
  options: {
    body?: unknown;
    method?: 'DELETE' | 'GET' | 'POST';
    schema?: ZodType<Output>;
  },
): Promise<Output | undefined> => {
  let response: Response;
  try {
    response = await fetch(path, {
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      headers:
        options.body === undefined
          ? undefined
          : {
              'Content-Type': 'application/json',
            },
      method: options.method ?? 'GET',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiFailure('api.network', { cause: error });
  }

  if (response.status === 204) {
    return undefined;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ApiFailure('api.unexpected', { cause: error });
  }

  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(payload);
    if (!parsedError.success) {
      throw new ApiFailure('api.unexpected');
    }

    throw new ApiFailure(parsedError.data.code, {
      fieldErrors: extractFieldErrors(parsedError.data.details),
      serverMessage: parsedError.data.message,
    });
  }

  if (!options.schema) {
    throw new ApiFailure('api.unexpected');
  }

  const parsedOutput = options.schema.safeParse(payload);
  if (!parsedOutput.success) {
    throw new ApiFailure('api.unexpected', { cause: parsedOutput.error });
  }

  return parsedOutput.data;
};
