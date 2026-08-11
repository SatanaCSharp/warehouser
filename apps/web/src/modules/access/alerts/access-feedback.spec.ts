import { afterEach, describe, expect, it, vi } from 'vitest';

import i18n from 'i18n';
import { alertAccessAction } from 'modules/access/alerts/access-feedback';

const toast = vi.hoisted(() => {
  const fn = vi.fn(() => 'pending-key');
  return Object.assign(fn, {
    danger: vi.fn(() => 'toast-key'),
    success: vi.fn(() => 'toast-key'),
    close: vi.fn(),
  });
});

vi.mock('shared/alerts/toast', () => ({ toast }));

describe('access feedback', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  it.each([
    ['assignRole', 'Updating the member role…', 'Member role updated.'],
    ['createRole', 'Creating the role…', 'Role created.'],
    ['deleteRole', 'Deleting the role…', 'Role deleted.'],
    [
      'transferManager',
      'Transferring warehouse management…',
      'Warehouse management transferred.',
    ],
    ['updateRole', 'Updating the role…', 'Role updated.'],
  ] as const)(
    'shows action-specific English pending and success feedback for %s',
    async (action, pending, success) => {
      const result = await alertAccessAction(
        action,
        Promise.resolve({ data: {} }),
      );

      expect(toast).toHaveBeenCalledWith(pending, {
        isLoading: true,
        timeout: 0,
      });
      expect(toast.close).toHaveBeenCalledWith('pending-key');
      expect(toast.success).toHaveBeenCalledWith(success);
      expect(result).toEqual({ data: {} });
    },
  );

  it('closes the pending toast without success feedback when the action fails', async () => {
    const result = await alertAccessAction(
      'createRole',
      Promise.resolve({ error: { code: 'api.unexpected' } }),
    );

    expect(toast.close).toHaveBeenCalledWith('pending-key');
    expect(toast.success).not.toHaveBeenCalled();
    // The global API-error middleware owns the failure toast.
    expect(toast.danger).not.toHaveBeenCalled();
    expect(result).toEqual({ error: { code: 'api.unexpected' } });
  });

  it('uses the active Ukrainian locale', async () => {
    await i18n.changeLanguage('uk');

    await alertAccessAction('createRole', Promise.resolve({ data: {} }));

    expect(toast).toHaveBeenCalledWith('Створюємо роль…', {
      isLoading: true,
      timeout: 0,
    });
    expect(toast.success).toHaveBeenCalledWith('Роль створено.');
  });
});
