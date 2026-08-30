# Server Use Case Boundaries

This guide applies to `apps/server`. It defines what may and may not surround the execution of a use
case — a command or a query — and where an error stops being the server's concern. It complements
[Server error handling](server-error-handling.md), which defines how errors are expressed and where
they are normalized.

The rule is one sentence: **a use case's `execute` runs the use case, and nothing wraps it.**

## 1. Do not wrap use case execution

A use case's public `execute` method contains the use case. Do not split it into a thin public
method that delegates to a private one through a higher-order helper, and do not introduce a helper
whose purpose is to surround an operation.

This is prohibited:

```ts
// Prohibited — `execute` is a wrapper, and the use case hides in a private method.
@Transactional()
execute(currentUser: CurrentUser, input: Input): Promise<Result> {
  return withSomething(this.logger, 'module.operation', currentUser, () =>
    this.doTheWork(currentUser, input),
  );
}

private async doTheWork(currentUser: CurrentUser, input: Input): Promise<Result> {
  // the actual use case
}
```

This is the required shape:

```ts
@Transactional()
async execute(currentUser: CurrentUser, input: Input): Promise<Result> {
  // the actual use case
}
```

The prohibition covers every wrapper, whatever it measures, records, classifies, or retries. Do not
add a `with*` helper around a use case, a decorator that intercepts its result or its failures, a
NestJS interceptor that surrounds use case invocation, or an abstract base class whose template
method calls a protected hook.

`@Transactional()` is the one exception, and it is not a general licence to add more: it is the
repository's single, already-decided mechanism for transaction scope, described in
[Server architecture](../server-architecture.md). Do not introduce a second decorator alongside it.

## 2. Do not measure

Do not add timing, duration, counting, latency, throughput, or any other measurement to production
server code, and do not add a helper that exists to produce one.

There is no timing wrapper, no `durationMs` field in a production log entry, no per-operation
outcome counter, no measurement side-channel. This follows from
[Structured logging instead of telemetry](../adr/03-08-2026-structured-logging-instead-of-telemetry.md)
and applies whether the measurement is emitted through a telemetry SDK, a metrics exporter, a
collector, or an ordinary structured log line: the mechanism is irrelevant, the measurement itself is
what is not allowed.

Log ordinary structured events with useful context through the shared `PinoLogger` when a specific
event is worth recording. Do not inject a logger into a use case for the sole purpose of recording
that the use case ran, and do not give a use case a logger constructor parameter that no statement in
its body uses.

A load or performance test may time the code it exercises — that measurement lives in the test and
never in production code.

## 3. Do not map an error to another type

An error keeps the type and the code its origin gave it, all the way to the single normalization
boundary. Do not catch a failure in a use case, a service, or a controller in order to re-raise it as
a different type or a different code.

Concretely, in `apps/server`:

- Do not translate an unknown infrastructure failure into a `SystemError` with a feature-specific
  code. It propagates untouched and the global exception filter classifies it once.
- Do not re-raise an `ApplicationError` as another `ApplicationError`, or as a `SystemError`.
- Do not convert an `AssertionError` into anything. It is a defect and must stay one.
- Do not wrap a failure only to attach a code that reads better to a caller.

The reason is that a remapped error is a lie about what happened, and the mapping is invisible at the
place the failure occurred. It also produces exactly the class of defect the mapping was meant to
prevent: a business rejection reported as "try again later", or a permanent refusal presented as
retriable.

Repositories and infrastructure adapters remain the narrow exception already stated in
[Server error handling](server-error-handling.md) §5 — they may catch a failure to recover from it,
to classify a _known vendor condition_ (a unique-violation code, a serialization failure), or to
preserve a cause. That is classifying a condition the adapter alone can recognize, not renaming an
error that already has a type.

## 4. Where an error becomes a message

The server's responsibility ends at the safe, contract-defined REST error envelope: a stable code and
safe interpolation parameters, produced once by the global exception filter.

Turning that code into something a member reads — the wording, the tone, the reassurance that nothing
changed, the retry affordance, the locale — is the web application's responsibility, defined in
[Web error handling and action feedback](web-error-handling.md). Do not add a server-side error type
whose only justification is that it carries a nicer message; add the handling for the existing code on
the web side instead.

When a route's documented failure is missing on the web, the fix belongs in `apps/web`: map the code
the server already emits to a translated key. It is never a reason to introduce a new server error
type or to remap an existing one.

## 5. Checklist

Before merging a change to a use case:

- `execute` contains the use case; there is no private method it merely delegates to through a
  helper.
- No `with*` helper, interceptor, or base-class template method surrounds the call.
- No timing, duration, or counter is produced by production code.
- Every constructor parameter is used by the body.
- No `try/catch` re-raises a failure as a different type or code.
