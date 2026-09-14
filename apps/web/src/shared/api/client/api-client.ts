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

// A plain object of field errors, or nothing. Arrays and `null` are objects to `typeof`, and neither
// is a field map.
const isFieldRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// A rejection that names one field and the rule it broke — the envelope the Workspace surfaces use —
// carries the rule as that field's error, so the owning form can translate the rule instead of a
// generic message.
const namedFieldRule = (
  details: Record<string, unknown> | undefined,
): Record<string, string> | undefined =>
  typeof details?.field === 'string' && typeof details.rule === 'string'
    ? { [details.field]: details.rule }
    : undefined;

// The `details.fields` map, keeping only the entries whose value is a rule string. An empty result is
// no field errors at all rather than an empty map, so a caller never has to tell the two apart.
const statedFieldRules = (
  fields: Record<string, unknown>,
): Record<string, string> | undefined => {
  const entries = Object.entries(fields).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const extractFieldErrors = (
  details: Record<string, unknown> | undefined,
): Record<string, string> | undefined => {
  const named = namedFieldRule(details);
  if (named !== undefined) {
    return named;
  }

  const fields = details?.fields;
  if (!isFieldRecord(fields)) {
    return undefined;
  }

  return statedFieldRules(fields);
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

// `undefined` and `null` values are omitted rather than sent as the strings `"undefined"`/`"null"`,
// so `params: { state: undefined }` is the same request as no `params` at all.
const isSendableParam = (value: unknown): boolean =>
  value !== undefined && value !== null;

const queryStringOf = (params: NonNullable<FetchArgs['params']>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (isSendableParam(value)) {
      search.append(key, String(value));
    }
  }

  return search.toString();
};

const querySeparatorFor = (url: string): string =>
  url.includes('?') ? '&' : '?';

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
 */
const withParams = (url: string, params: FetchArgs['params']): string => {
  if (!params) {
    return url;
  }

  const query = queryStringOf(params);
  if (query === '') {
    return url;
  }

  return `${url}${querySeparatorFor(url)}${query}`;
};

const requestOf = (args: string | FetchArgs): FetchArgs =>
  typeof args === 'string' ? { url: args } : args;

const headersFor = (request: FetchArgs): Headers => {
  const headers = new Headers(request.headers as HeadersInit | undefined);
  if (request.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
};

const bodyOf = (request: FetchArgs): string | undefined =>
  request.body === undefined ? undefined : JSON.stringify(request.body);

const methodOf = (request: FetchArgs): string => request.method ?? 'GET';

const endpointOptionsOf = (
  extraOptions: ApiExtraOptions | undefined,
): ApiExtraOptions => extraOptions ?? {};

// An abort is the caller's own cancellation rather than a failed request, so it stays a rejection
// RTK Query recognizes instead of becoming an `api.network` result.
const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

type SentRequest =
  { readonly failure: ApiFailure } | { readonly response: Response };

const send = async (
  request: FetchArgs,
  signal: AbortSignal,
): Promise<SentRequest> => {
  try {
    return {
      response: await fetch(withParams(request.url, request.params), {
        body: bodyOf(request),
        credentials: 'include',
        headers: headersFor(request),
        method: methodOf(request),
        signal,
      }),
    };
  } catch (error) {
    if (isAbort(error)) {
      throw error;
    }

    return { failure: { code: 'api.network' } };
  }
};

type ApiResult = { data: unknown } | { error: ApiFailure };

// What an endpoint that declared `emptyResponse` expects a 204 to resolve to. One that declared
// nothing gets `undefined`, which is the same answer it got before the option existed.
const emptyResponseData = (endpointOptions: ApiExtraOptions): unknown =>
  Object.hasOwn(endpointOptions, 'emptyResponse')
    ? endpointOptions.emptyResponse
    : undefined;

// Either the response settled without a body to judge — a 204, or a body that is not JSON — or it
// carries one.
type ResponsePayload =
  { readonly body: unknown } | { readonly settled: ApiResult };

const readPayload = async (
  response: Response,
  endpointOptions: ApiExtraOptions,
): Promise<ResponsePayload> => {
  if (response.status === 204) {
    return { settled: { data: emptyResponseData(endpointOptions) } };
  }

  try {
    return { body: await response.json() };
  } catch {
    return { settled: { error: { code: 'api.unexpected' } } };
  }
};

// An endpoint that declared a schema gets the parsed value; one that declared none gets the body as
// it arrived.
const validatedData = (
  body: unknown,
  schema: ZodType | undefined,
): ApiResult => {
  if (!schema) {
    return { data: body };
  }

  const parsedData = schema.safeParse(body);
  if (!parsedData.success) {
    return { error: { code: 'api.unexpected' } };
  }

  return { data: parsedData.data };
};

const apiBaseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  ApiFailure,
  ApiExtraOptions
> = async (args, api, extraOptions) => {
  const endpointOptions = endpointOptionsOf(extraOptions);

  const sent = await send(requestOf(args), api.signal);
  if ('failure' in sent) {
    return { error: sent.failure };
  }

  const payload = await readPayload(sent.response, endpointOptions);
  if ('settled' in payload) {
    return payload.settled;
  }

  if (!sent.response.ok) {
    return { error: normalizeError(payload.body) };
  }

  return validatedData(payload.body, endpointOptions.schema);
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
