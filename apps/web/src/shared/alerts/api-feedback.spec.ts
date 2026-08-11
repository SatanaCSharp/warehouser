import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => {
  const fn = vi.fn(() => 'toast-key');
  return Object.assign(fn, {
    danger: vi.fn<
      (message: unknown, options?: { onClose?: () => void }) => string
    >(() => 'toast-key'),
    success: vi.fn(() => 'toast-key'),
    close: vi.fn(),
  });
});

vi.mock('shared/alerts/toast', () => ({ toast }));

type AlertApiFailure =
  typeof import('shared/alerts/api-feedback').alertApiFailure;

let alertApiFailure: AlertApiFailure;

const lastOnClose = (): (() => void) => {
  const onClose = toast.danger.mock.calls.at(-1)?.[1]?.onClose;
  if (!onClose) {
    throw new Error('The failure toast was raised without an onClose handler.');
  }
  return onClose;
};

describe('API feedback', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // The registry of on-screen failure codes is module state, so each
    // scenario gets a fresh module rather than inheriting the previous one.
    vi.resetModules();
    ({ alertApiFailure } = await import('shared/alerts/api-feedback'));
  });

  it('deduplicates the same translated API failure while it is on screen', () => {
    const error = { code: 'auth.invalid_credentials' };

    alertApiFailure(error);
    alertApiFailure(error);

    expect(toast.danger).toHaveBeenCalledTimes(1);
    expect(toast.danger).toHaveBeenCalledWith(
      'The email or password is incorrect.',
      expect.any(Object),
    );
  });

  it('reports the same failure again once its toast closed', () => {
    const error = { code: 'auth.invalid_credentials' };

    alertApiFailure(error);
    lastOnClose()();
    alertApiFailure(error);

    expect(toast.danger).toHaveBeenCalledTimes(2);
  });

  it('reports distinct failure codes independently', () => {
    alertApiFailure({ code: 'auth.invalid_credentials' });
    alertApiFailure({ code: 'api.network' });

    expect(toast.danger).toHaveBeenCalledTimes(2);
    expect(toast.danger).toHaveBeenLastCalledWith(
      'Check your connection and try again.',
      expect.any(Object),
    );
  });
});
