import { HttpException } from '@nestjs/common';
import {
  ApplicationError,
  AssertionError,
  SystemError,
} from '@warehouser/shared-types/errors';
import { ZodValidationException } from 'nestjs-zod';

/** Which kind of failure an `unknown` turned out to be.
 *
 * The global filter is handed `unknown` and must decide what it is holding before it can map it
 * (server-error-handling.md §6). Every one of those decisions is an `instanceof`, and an
 * `instanceof` in a branch is a question with no name: the filter, the Workspace name adapter and
 * the validation-code reader each asked "is this the error type I can read fields off?" in their own
 * spelling. Naming them puts the taxonomy in one list and keeps each branch narrowing. */

/** An expected business rejection. */
export const isApplicationError = (
  exception: unknown,
): exception is ApplicationError => exception instanceof ApplicationError;

/** A known infrastructure or technical failure, which is the only kind carrying a `cause` worth
 * logging. */
export const isSystemError = (exception: unknown): exception is SystemError =>
  exception instanceof SystemError;

/** Either of the two failures that carry a stable boundary `code`. */
export const isCodedError = (
  exception: unknown,
): exception is ApplicationError | SystemError =>
  isApplicationError(exception) || isSystemError(exception);

/** A broken invariant or programming defect, raised by `assert` with a message rather than an error
 * factory. */
export const isAssertionError = (
  exception: unknown,
): exception is AssertionError => exception instanceof AssertionError;

/** A failure NestJS itself raised, already carrying the status it wants. */
export const isHttpException = (
  exception: unknown,
): exception is HttpException => exception instanceof HttpException;

/** A request refused by the global Zod validation pipe, which is the only failure that can name the
 * request fields that were wrong. */
export const isZodValidationException = (
  exception: unknown,
): exception is ZodValidationException =>
  exception instanceof ZodValidationException;

/** Anything at all that was thrown as an `Error`. Asked last: everything above is one. */
export const isError = (exception: unknown): exception is Error =>
  exception instanceof Error;
