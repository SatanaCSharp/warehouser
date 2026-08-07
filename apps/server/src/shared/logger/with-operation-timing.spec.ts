import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError, SystemError } from '@warehouser/shared-types/errors';
import { withOperationTiming } from 'shared/logger/with-operation-timing';

const actor = {
  userId: '00000000-0000-4000-8000-000000000001',
  warehouseId: '00000000-0000-4000-8000-000000000002',
};

describe('withOperationTiming', () => {
  const logger = { info: jest.fn() };

  beforeEach(() => jest.clearAllMocks());

  it('logs a success outcome with the operation, actor, and a non-negative duration', async () => {
    const result = await withOperationTiming(
      logger,
      'users.create_member',
      actor,
      () => Promise.resolve('created'),
    );

    expect(result).toBe('created');
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [entry] = logger.info.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({
      operation: 'users.create_member',
      outcomeCode: 'success',
      userId: actor.userId,
      warehouseId: actor.warehouseId,
    });
    expect(entry.durationMs).toEqual(expect.any(Number));
    expect(entry.durationMs as number).toBeGreaterThanOrEqual(0);
  });

  it('logs the ApplicationError code as the outcome and rethrows it', async () => {
    const error = new ApplicationError(ErrorCode.USERS_SELF_ACTION_DENIED);

    await expect(
      withOperationTiming(logger, 'users.delete_member', actor, () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcomeCode: 'users.self_action_denied' }),
    );
  });

  it('logs the SystemError code as the outcome and rethrows it', async () => {
    const error = new SystemError(
      ErrorCode.USERS_CREATION_UNAVAILABLE,
      new Error('database unavailable'),
    );

    await expect(
      withOperationTiming(logger, 'users.create_member', actor, () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcomeCode: 'users.creation_unavailable' }),
    );
  });

  it('logs the internal-error fallback code for an unknown thrown value and rethrows it', async () => {
    const error = new Error('unexpected');

    await expect(
      withOperationTiming(logger, 'users.create_member', actor, () =>
        Promise.reject(error),
      ),
    ).rejects.toBe(error);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ outcomeCode: 'system.internal_error' }),
    );
  });

  it('never logs anything beyond operation, outcomeCode, durationMs, userId, and warehouseId', async () => {
    await withOperationTiming(
      logger,
      'users.change_member_password',
      actor,
      () => Promise.resolve(undefined),
    );

    const [entry] = logger.info.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(entry).sort()).toEqual(
      [
        'durationMs',
        'operation',
        'outcomeCode',
        'userId',
        'warehouseId',
      ].sort(),
    );
  });
});
