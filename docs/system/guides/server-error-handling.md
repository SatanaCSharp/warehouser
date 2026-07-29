# Server Error Handling

This guide applies to `apps/server`. It defines how server code expresses conditions, throws typed
errors, and maps uncaught failures at the NestJS HTTP boundary. It does not define web application
error presentation or client-side state management.

Decision record:
[Server Error Handling with Typed Errors and a Global NestJS Filter](../adr/24-07-2026-server-error-handling.md).

## 1. Define conditions as predicates

Write predicates in functional style:

- Receive all required values as arguments.
- Return `boolean` or a TypeScript type predicate.
- Do not mutate state, perform I/O, log, or throw.
- Give domain conditions domain names.

```ts
export const canReserveStock = (
  available: number,
  requested: number,
): boolean => available >= requested;
```

Use the narrowest appropriate location:

- one implementation: keep the predicate next to that implementation;
- one server feature: `apps/server/src/<module-name>/predicates/`;
- multiple server features: `apps/server/src/shared/predicates/`;
- genuinely general or reused outside the server: `packages/utils/src/predicates/`.

Do not promote a predicate for hypothetical reuse. Server evaluation remains authoritative for
business conditions even when a general predicate has another consumer.

## 2. Enforce predicates with assertions

Use `assert` from `@warehouser/utils/asserts` to enforce a condition:

- `ApplicationError` represents an expected business rejection;
- `SystemError` represents a known infrastructure or technical failure;
- `AssertionError` represents a broken invariant or programming defect.

Keep predicates independent from error construction. They should remain useful for checks that do
not throw.

A string passed to `assert` creates an `AssertionError`; reserve this form for genuine invariants:

```ts
assert(calculatedTotal >= 0, 'Calculated order total must not be negative');
```

Not every library or asynchronous failure originates from an assertion. Use `assert` to enforce
conditions; do not introduce `assert(false, ...)` where no meaningful condition exists.

## 3. Use named error factories

Do not pass an anonymous factory such as
`() => new ApplicationError(ErrorCode.INSUFFICIENT_STOCK)` to `assert`.

Define a named error factory close to the assertion under
`apps/server/src/<module-name>/domain/errors/`. Its name describes the failure, uses the `Error`
suffix, accepts every value required to construct the error, and returns the configured error
instance:

```ts
// apps/server/src/inventory/domain/errors/insufficient-stock.error.ts
export const InsufficientStockError = (
  stock: Stock,
  requested: number,
): ApplicationError =>
  new ApplicationError(ErrorCode.INSUFFICIENT_STOCK, {
    sku: stock.sku,
    available: stock.available,
    requested,
  });
```

Pass the named error result to `assert`:

```ts
assert(
  canReserveStock(stock.available, requested),
  InsufficientStockError(stock, requested),
);
```

Apply the same convention to named `SystemError` factories. Preserve an originating technical
failure as `cause` when wrapping it adds useful classification or context.

## 4. Define stable server boundary codes

Use stable, machine-readable codes rather than messages or JavaScript class names. Put codes in
`packages/shared-types/src` when they are part of a boundary shared with another package or
application:

```ts
export const ErrorCode = {
  INSUFFICIENT_STOCK: 'inventory.insufficient_stock',
  INTERNAL_ERROR: 'system.internal_error',
} as const;
```

Define the public REST error-envelope schema in `@warehouser/contracts`. This establishes the
server response shape without prescribing client behavior.

Never return stack traces, database errors, assertion messages, causes, or unknown exception
messages. Only explicitly safe application details may be included in a response.

## 5. Follow the NestJS boundary responsibilities

The request path is:

```text
request
  -> middleware
  -> guards
  -> interceptors
  -> pipes
  -> controller
  -> use case
  -> domain/service/repository
  -> response

uncaught error from the request path
  -> global exception filter
  -> safe REST error response
```

Apply these responsibilities:

- The global Zod validation pipe validates and transforms incoming request shapes before the
  controller runs. Do not put stateful business rules in pipes.
- Guards handle transport-level authentication and authorization.
- Controllers map transport input, call a use case, and map successful output. They let errors
  propagate and do not routinely catch, log, or translate them.
- Domain code and use cases throw framework-independent errors and do not import NestJS
  `HttpException` classes.
- Repositories and infrastructure adapters catch failures only to recover, classify a known
  vendor condition, add useful context, or preserve a cause. Otherwise they let the failure
  propagate.

## 6. Normalize failures once

Register one global exception filter through NestJS dependency injection with `APP_FILTER`. It is
the single HTTP error-normalization and request-failure logging boundary.

The filter must handle:

| Failure                | HTTP result                                            | Internal handling                                              |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `ApplicationError`     | Explicit code-specific 4xx                             | Log at the severity appropriate to an expected rejection       |
| `SystemError`          | Safe 500, 502, or 503                                  | Log the error, stack, and cause                                |
| `AssertionError`       | Generic 500/internal code                              | Log as a defect; never expose its message                      |
| NestJS `HttpException` | Preserve the appropriate status in the shared envelope | Normalize validation, authentication, and authorization shapes |
| Unknown error          | Generic 500/internal code                              | Log the original error and stack                               |

Keep the application-code-to-HTTP-status mapping explicit and exhaustive. Avoid overlapping route,
controller, and global filters for this taxonomy because a locally handled exception does not
continue through subsequent filters.

Log the complete internal failure once in the global filter. Include its category, code, cause,
stack, request or correlation ID, HTTP method, and route. Do not log credentials, authorization
headers, secrets, or unrestricted request bodies.

## 7. End-to-end flow

```text
pure predicate
  -> assert(predicate(...), NamedErrorFactory(...))
  -> uncaught typed error propagates through the use case and controller
  -> global NestJS exception filter classifies, logs, and maps it
  -> safe contract-defined REST error envelope
```

Test predicates without NestJS. Test error factories for codes and safe details. Test the global
filter for every category, NestJS validation/authentication errors, unknown failures, status
mapping, single-point logging, and information disclosure.
