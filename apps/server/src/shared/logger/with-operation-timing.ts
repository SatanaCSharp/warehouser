import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError, SystemError } from '@warehouser/shared-types/errors';

export interface OperationActor {
  readonly userId: string;
  readonly warehouseId: string;
}

type OperationLogger = {
  info: (entry: Readonly<Record<string, unknown>>) => void;
};

const SUCCESS_OUTCOME = 'success';

const outcomeCodeOf = (error: unknown): string =>
  error instanceof ApplicationError || error instanceof SystemError
    ? error.code
    : ErrorCode.INTERNAL_ERROR;

// sad.md §8 promises a structured, per-action Pino timing log for every
// users command: operation, outcome code, durationMs, and only the actor's
// userId/warehouseId — never credential fields. Wrapping the whole command
// body captures every exit path (`assert`/`assertDefined` throw typed
// errors), success and denial alike, in a single log call.
export const withOperationTiming = async <T>(
  logger: OperationLogger,
  operation: string,
  actor: OperationActor,
  run: () => Promise<T>,
): Promise<T> => {
  const startedAt = Date.now();
  let outcomeCode: string = SUCCESS_OUTCOME;
  try {
    return await run();
  } catch (error) {
    outcomeCode = outcomeCodeOf(error);
    throw error;
  } finally {
    logger.info({
      operation,
      outcomeCode,
      durationMs: Date.now() - startedAt,
      userId: actor.userId,
      warehouseId: actor.warehouseId,
    });
  }
};
