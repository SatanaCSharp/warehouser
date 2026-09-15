# Structured Server Logging with Pino

Status: Accepted

Date: 2026-07-27

## Context

The NestJS server needs one structured logging mechanism for application diagnostics and HTTP
infrastructure. Uncoordinated use of `console`, NestJS's default logger, or independently configured
logger instances would produce inconsistent context, levels, and output formats.

The shared logging module already belongs at
`apps/server/src/shared/logger/app-logger.module.ts`. The runtime dependencies must be declared
explicitly so the module works in every installation.

## Decision

Use `nestjs-pino` as the NestJS integration, `pino` as the structured logger, `pino-http` for HTTP
logging support, and `pino-pretty` for optional human-readable development output. Declare all four
packages as server dependencies.

Configure logging centrally in `AppLoggerModule` at
`apps/server/src/shared/logger/app-logger.module.ts`. Application providers inject `PinoLogger`,
set the class name as context in the constructor, and log at the level appropriate to the event.
Log structured properties when they help identify or correlate an operation, but never include
credentials, tokens, passwords, or other sensitive values.

```ts
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class RegisterServiceCommandProcessor {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(RegisterServiceCommandProcessor.name);
  }

  execute(): void {
    this.logger.debug('Log debug example');
    this.logger.info('Log example');
  }
}
```

Do not instantiate Pino directly in feature code and do not use `console.*` for application logs.
The global exception filter remains responsible for recording an uncaught failure once; lower
layers must not catch and log an error merely to rethrow it.

## Alternatives

- NestJS's default logger: rejected because it does not provide the selected Pino HTTP integration
  and shared structured-output configuration.
- Direct `pino` instances in each module: rejected because contexts, transports, redaction, and
  levels would drift between modules.
- `console.*`: rejected because it bypasses the application logger and produces inconsistent,
  weakly structured output.

## Consequences

- Server logs use one centrally configured structured format and level policy.
- Provider logs carry an explicit class context, making their source discoverable.
- Pretty output can be enabled for local development without changing application logging calls.
- Four runtime packages must be installed and kept compatible.
- Developers must choose useful levels and fields; centralization cannot prevent noisy or
  low-value messages by itself.
- Sensitive-data handling and future redaction rules remain operational responsibilities.

## Links

- [Server architecture](../server-architecture.md)
- [Server error handling](../guides/server-error-handling.md)
