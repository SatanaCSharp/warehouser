import type { BaseQueryFn, FetchArgs } from '@reduxjs/toolkit/query';
import { createApi } from '@reduxjs/toolkit/query/react';
import { errorResponseSchema } from '@warehouser/contracts/auth';
import type { ZodType } from 'zod';

export type ApiFailure = {
  code: string;
  fieldErrors?: Record<string, string>;
  /**
   * The refusal's own safe envelope, exactly as the server sent it. A rule the
   * member broke is often only explicable with the figure it was measured
   * against — AC-19b's "this order cannot go below 160" is the allocated
   * quantity, which the server already publishes as
   * `details: { allocatedQuantity, submittedQuantity }`. Dropping it here left
   * every such message able to state the rule but never the number.
   *
   * It is the server's envelope, not arbitrary data: `errorResponseSchema`
   * bounds it, and the filter decides what is safe to disclose.
   */
  details?: Record<string, unknown>;
};

export const isApiFailure = (error: unknown): error is ApiFailure =>
  typeof error === 'object' &&
  error !== null &&
  Object.hasOwn(error, 'code') &&
  typeof (error as { code?: unknown }).code === 'string';

type ApiExtraOptions = {
  emptyResponse?: null;
  schema?: ZodType;
};

const extractFieldErrors = (
  details: Record<string, unknown> | undefined,
): Record<string, string> | undefined => {
  // A rejection that names one field and the rule it broke — the envelope the
  // Workspace surfaces use — carries the rule as that field's error, so the
  // owning form can translate the rule instead of a generic message.
  if (typeof details?.field === 'string' && typeof details.rule === 'string') {
    return { [details.field]: details.rule };
  }

  const fields = details?.fields;
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
    return undefined;
  }

  const entries = Object.entries(fields).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const normalizeError = (payload: unknown): ApiFailure => {
  const parsedError = errorResponseSchema.safeParse(payload);
  if (!parsedError.success) {
    return { code: 'api.unexpected' };
  }

  const fieldErrors = extractFieldErrors(parsedError.data.details);
  return {
    code: parsedError.data.code,
    ...(fieldErrors ? { fieldErrors } : {}),
    ...(parsedError.data.details ? { details: parsedError.data.details } : {}),
  };
};

/**
 * The query string an endpoint asked for, appended to its path.
 *
 * `FetchArgs` carries `params` because RTK Query's own `fetchBaseQuery` reads
 * it; this base query is hand-written, so a `params` it did not read was
 * accepted by the type checker and then silently dropped — the request went
 * out unfiltered and the endpoint's own filter never happened. That is not a
 * cosmetic loss: the by-line purchase-draft read (AC-22) filters by draft
 * state on the server, so dropping `state` returned every state's lines at
 * once.
 *
 * `undefined` and `null` values are omitted rather than sent as the strings
 * `"undefined"`/`"null"`, so `params: { state: undefined }` is the same
 * request as no `params` at all.
 */
const withParams = (url: string, params: FetchArgs['params']): string => {
  if (!params) {
    return url;
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      search.append(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url;
};

const apiBaseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  ApiFailure,
  ApiExtraOptions
> = async (args, api, extraOptions) => {
  const endpointOptions = extraOptions ?? {};
  const request = typeof args === 'string' ? { url: args } : args;
  const headers = new Headers(request.headers as HeadersInit | undefined);
  if (request.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try {
    response = await fetch(withParams(request.url, request.params), {
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
      credentials: 'include',
      headers,
      method: request.method ?? 'GET',
      signal: api.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return { error: { code: 'api.network' } };
  }

  if (
    response.status === 204 &&
    Object.hasOwn(endpointOptions, 'emptyResponse')
  ) {
    return { data: endpointOptions.emptyResponse };
  }

  if (response.status === 204) {
    return { data: undefined };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { error: { code: 'api.unexpected' } };
  }

  if (!response.ok) {
    return { error: normalizeError(data) };
  }

  if (!endpointOptions.schema) {
    return { data };
  }

  const parsedData = endpointOptions.schema.safeParse(data);
  if (!parsedData.success) {
    return { error: { code: 'api.unexpected' } };
  }

  return { data: parsedData.data };
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: apiBaseQuery,
  tagTypes: [
    'CurrentAccess',
    'CurrentSession',
    // delivery-addresses T21 — the Customers destination's list and detail
    // reads, and every address-book write that changes either.
    'Customers',
    'AccessMembers',
    'Demand',
    'Items',
    'PackagingTypes',
    'Permissions',
    'PurchaseDrafts',
    'RejectionReasons',
    'Roles',
    'WarehouseDeliveryAddress',
    'WorkspaceContext',
    'WorkspaceMembers',
    'WorkspacePermissions',
    'WorkspaceRoles',
    'WorkspaceUsers',
    'WorkspaceWarehouses',
  ],
  endpoints: () => ({}),
});
