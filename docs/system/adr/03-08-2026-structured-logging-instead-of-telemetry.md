# Use Structured Logging Instead of Telemetry in the Server

Status: Accepted

Date: 2026-08-03

## Context

The server needs operational diagnostics for application workflows, failures, and HTTP requests.
Its accepted logging architecture already provides centrally configured structured Pino logs with
class context and request correlation. Adding telemetry would introduce a second diagnostics path,
additional instrumentation conventions, and exporter or collector operations that the application
does not currently need.

## Decision

Do not add telemetry instrumentation, telemetry SDKs, tracing, metrics exporters, collectors, or
feature-specific telemetry abstractions to `apps/server`.

Use the existing structured application logging mechanism for server diagnostics. Application
providers inject `PinoLogger` through `AppLoggerModule`, set their class name as context, and emit
ordinary structured log events at an appropriate level. Include useful operation and correlation
fields without logging credentials, tokens, passwords, or other sensitive values.

This decision does not require a log statement for every state transition. Log events must remain
operationally useful and follow the existing rule that an uncaught failure is recorded once by the
global exception filter; lower layers do not catch, log, and rethrow it.

## Alternatives

- Add OpenTelemetry or another general telemetry SDK: rejected because it adds instrumentation,
  export, and operational infrastructure alongside a logging path that currently satisfies the
  server's diagnostic needs.
- Add feature-specific telemetry wrappers or event collectors: rejected because they create a
  parallel observability convention and make later consolidation harder.
- Use only the existing centralized structured logging: accepted because it preserves one
  diagnostic mechanism and keeps feature code and operations simpler.

## Consequences

- Server diagnostics continue to use one centrally configured structured logging mechanism.
- Feature implementations do not add spans, counters, telemetry event classes, exporters, or
  collector configuration.
- Operations can search and aggregate structured log fields, but do not receive distributed traces
  or dedicated application metrics from the server.
- Developers must choose meaningful log levels, messages, and structured fields; logging alone does
  not guarantee useful diagnostics.
- If production needs later require traces or metrics that logs cannot reasonably provide, this
  decision must be revisited with a new ADR covering instrumentation and operational ownership.

## Links

- [Structured server logging with Pino](27-07-2026-structured-logging-with-pino.md)
- [Server architecture](../server-architecture.md)
- [System architecture description](../sad.md)
