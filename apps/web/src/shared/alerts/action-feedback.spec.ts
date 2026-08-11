import { beforeEach, describe, expect, it, vi } from 'vitest';

import { alertActionPromise } from 'shared/alerts/action-feedback';

const toast = vi.hoisted(() => {
  const fn = vi.fn(() => 'pending-key');
  return Object.assign(fn, {
    danger: vi.fn(() => 'toast-key'),
    success: vi.fn(() => 'toast-key'),
    close: vi.fn(),
  });
});

vi.mock('shared/alerts/toast', () => ({ toast }));

const messages = { loading: 'Saving…', success: 'Saved.' };

describe('action feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the loading toast open until the action settles', async () => {
    let settle: ((result: { data: string }) => void) | undefined;
    const pending = alertActionPromise(
      new Promise<{ data: string }>((resolve) => {
        settle = resolve;
      }),
      messages,
    );

    expect(toast).toHaveBeenCalledWith('Saving…', {
      isLoading: true,
      timeout: 0,
    });
    expect(toast.close).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();

    settle?.({ data: 'ok' });

    await expect(pending).resolves.toEqual({ data: 'ok' });
    expect(toast.close).toHaveBeenCalledWith('pending-key');
    expect(toast.success).toHaveBeenCalledWith('Saved.');
  });

  it('leaves the failure toast to the API error middleware', async () => {
    await alertActionPromise(
      Promise.resolve({ error: { code: 'api.unexpected' } }),
      messages,
    );

    expect(toast.close).toHaveBeenCalledWith('pending-key');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.danger).not.toHaveBeenCalled();
  });

  it('closes the loading toast and rethrows when the action rejects', async () => {
    const failure = new Error('aborted');

    await expect(
      alertActionPromise(Promise.reject(failure), messages),
    ).rejects.toBe(failure);
    expect(toast.close).toHaveBeenCalledWith('pending-key');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
