# Server Error Handling with Typed Errors and a Global NestJS Filter

Status: Accepted

Date: 2026-07-24

## Context

The server needs consistent error semantics without wrapping every controller endpoint in
`try/catch`. Business rejections, known technical failures, and broken program invariants have
different operational meanings, but NestJS must ultimately translate all uncaught failures into
safe HTTP responses.

Conditions also need names and reuse boundaries. Embedding conditions and anonymous error
construction at call sites makes domain rules harder to discover and leads to inconsistent error
codes and HTTP mappings.

This decision concerns `apps/server`. Error presentation and state-management behavior in
`apps/web` are deliberately out of scope.

## Decision

Classify server failures as:

- `ApplicationError`: an expected business rejection that a caller can act on;
- `SystemError`: a known infrastructure or technical failure;
- `AssertionError`: an impossible state, broken invariant, or programming defect.

Represent conditions as pure predicate functions and enforce them with `assert` from
`@warehouser/utils/asserts`. Application and system errors are created by named error factory
functions placed close to their server usage under `src/<module-name>/errors/`. Stable,
machine-readable error codes live in `packages/shared-types/src` when they are part of a shared
boundary. REST error envelopes are schemas in `@warehouser/contracts`.

Errors propagate through domain code, use cases, and controllers without routine local catches.
One dependency-injected global NestJS exception filter classifies uncaught failures, maps them to
HTTP statuses and the shared response contract, records the complete internal failure once, and
prevents sensitive implementation details from reaching the response.

Transport validation remains the responsibility of the global Zod pipe. Authentication and
transport-level authorization remain guard responsibilities. Domain and application code do not
depend on NestJS HTTP exception classes.

## Alternatives

- Endpoint-level `try/catch`: rejected because it duplicates classification, logging, and response
  mapping across controllers.
- Throwing NestJS `HttpException` from use cases or domain code: rejected because it couples
  application behavior to the HTTP transport.
- Returning result unions from every operation: not selected as the default because the existing
  server uses exceptions and NestJS already supplies a centralized exception boundary. Explicit
  result types may still be used where failure is part of normal local control flow.
- Translating raw error messages: rejected because messages are unstable, may contain sensitive
  details, and are not reliable machine-readable identifiers.

## Consequences

- Controllers remain small transport adapters and normally contain no error-handling boilerplate.
- Every public application error code requires an intentional HTTP mapping.
- Assertion and unknown failures become safe internal-error responses while retaining full
  diagnostics in server logs.
- Predicate and named error-factory placement makes business conditions and failure construction
  discoverable by module.
- Shared codes and REST contracts create a stable boundary without prescribing how any client
  application presents or stores errors.
- The global exception filter becomes critical infrastructure and requires focused tests for every
  error category, NestJS exceptions, unknown failures, logging, and information disclosure.
