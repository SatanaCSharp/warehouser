import { mutationFeedbackMiddleware } from 'store/middleware/mutation-feedback.middleware';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => {
  const fn = vi.fn(() => 'pending-key');
  return Object.assign(fn, {
    danger: vi.fn(() => 'toast-key'),
    success: vi.fn(() => 'toast-key'),
    close: vi.fn(),
  });
});

vi.mock('shared/alerts/toast', () => ({ toast }));
// Renders `<namespace>:<key>` plus any interpolated subject, so a case can
// assert which description was chosen without depending on the copy itself.
// Every interpolation the registry passes is rendered, not a fixed `name`, so
// a registry entry describing its outcome by any other key is still observable.
vi.mock('i18n', () => ({
  default: {
    t: (key: string, options: { ns: string } & Record<string, unknown>) => {
      const subjects = Object.entries(options)
        .filter(
          ([option, value]) => option !== 'ns' && typeof value === 'string',
        )
        .map(([, value]) => value as string);
      const subject = subjects.length > 0 ? ` (${subjects.join(', ')})` : '';

      return `${options.ns}:${key}${subject}`;
    },
  },
}));

/** One RTK Query mutation lifecycle action, shaped as the thunk dispatches it. */
const lifecycleAction = (
  status: 'pending' | 'fulfilled' | 'rejected',
  endpointName: string,
  originalArgs?: unknown,
  requestId = 'request-id',
): object => ({
  meta: {
    arg: { endpointName, originalArgs, type: 'mutation' },
    requestId,
    requestStatus: status,
  },
  type: `api/executeMutation/${status}`,
});

const run = (action: object): void => {
  mutationFeedbackMiddleware({} as never)(vi.fn())(action);
};

describe('mutationFeedbackMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards every action it observes', () => {
    const next = vi.fn();
    const action = lifecycleAction('pending', 'createWarehouse');

    mutationFeedbackMiddleware({} as never)(next)(action);

    expect(next).toHaveBeenCalledWith(action);
  });

  it('holds the loading toast open until the mutation commits, then reports it', () => {
    run(lifecycleAction('pending', 'createWarehouse'));

    expect(toast).toHaveBeenCalledWith('pending:workspace.createWarehouse', {
      isLoading: true,
      timeout: 0,
    });
    expect(toast.close).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();

    run(lifecycleAction('fulfilled', 'createWarehouse'));

    expect(toast.close).toHaveBeenCalledWith('pending-key');
    expect(toast.success).toHaveBeenCalledWith(
      'success:workspace.createWarehouse',
    );
  });

  it('leaves the failure toast to the API error middleware', () => {
    run(lifecycleAction('pending', 'createWarehouse'));
    run(lifecycleAction('rejected', 'createWarehouse'));

    expect(toast.close).toHaveBeenCalledWith('pending-key');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.danger).not.toHaveBeenCalled();
  });

  // AC-11, AC-11a — one endpoint, two outcomes, chosen from the argument.
  it.each([
    [true, 'archiveWarehouse'],
    [false, 'restoreWarehouse'],
  ])('reports archival %s as %s', (archived, action) => {
    run(lifecycleAction('fulfilled', 'setWarehouseArchival', { archived }));

    expect(toast.success).toHaveBeenCalledWith(`success:workspace.${action}`);
  });

  it('interpolates the outcome’s subject into the description', () => {
    run(
      lifecycleAction('fulfilled', 'assignWarehouseMembership', {
        warehouseName: 'Central DC',
      }),
    );

    expect(toast.success).toHaveBeenCalledWith(
      'success:workspace.giveWarehouseAccess (Central DC)',
    );
  });

  // AC-21 — "the success copy states the outcome that committed": closing a
  // purchase draft commits a reason, so the reason is what the toast reports
  // back, rather than a generic "Purchase draft closed."
  it('names the reason a purchase draft was closed with (AC-21)', () => {
    run(
      lifecycleAction('fulfilled', 'closePurchaseDraft', {
        input: { closureReason: 'The supplier cannot fulfil the order' },
      }),
    );

    expect(toast.success).toHaveBeenCalledWith(
      'success:purchase-draft.closePurchaseDraft (The supplier cannot fulfil the order)',
    );
  });

  it('reports nothing for an endpoint the registry does not name', () => {
    // `setActiveWarehouse` records where the actor has been and is not an
    // action they asked for, so it owes them no feedback at all.
    run(lifecycleAction('pending', 'setActiveWarehouse'));
    run(lifecycleAction('fulfilled', 'setActiveWarehouse'));

    expect(toast).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('reports nothing for a successful login, the documented exception', () => {
    run(lifecycleAction('fulfilled', 'signIn'));

    expect(toast.success).not.toHaveBeenCalled();
  });

  it('ignores query lifecycle actions', () => {
    run({
      meta: {
        arg: { endpointName: 'listWorkspaceWarehouses', type: 'query' },
        requestId: 'request-id',
        requestStatus: 'fulfilled',
      },
      type: 'api/executeQuery/fulfilled',
    });

    expect(toast.success).not.toHaveBeenCalled();
  });

  it('closes each concurrent request’s own toast', () => {
    toast.mockReturnValueOnce('first-key').mockReturnValueOnce('second-key');

    run(lifecycleAction('pending', 'createWarehouse', undefined, 'first'));
    run(lifecycleAction('pending', 'createWarehouse', undefined, 'second'));
    run(lifecycleAction('fulfilled', 'createWarehouse', undefined, 'second'));

    expect(toast.close).toHaveBeenCalledExactlyOnceWith('second-key');
  });
});
