import { afterEach, describe, expect, it, vi } from 'vitest';

import i18n from 'i18n';
import { alertAccessSuccess } from 'modules/access/alerts/access-feedback';

const toast = vi.hoisted(() => ({ success: vi.fn() }));

vi.mock('react-toastify', () => ({ toast }));

describe('access feedback', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  it.each([
    ['assignRole', 'Member role updated.'],
    ['createRole', 'Role created.'],
    ['deleteRole', 'Role deleted.'],
    ['transferManager', 'Warehouse management transferred.'],
    ['updateRole', 'Role updated.'],
  ] as const)(
    'shows action-specific English feedback for %s',
    (action, copy) => {
      alertAccessSuccess(action);

      expect(toast.success).toHaveBeenCalledWith(copy, expect.any(Object));
    },
  );

  it('uses the active Ukrainian locale', async () => {
    await i18n.changeLanguage('uk');

    alertAccessSuccess('createRole');

    expect(toast.success).toHaveBeenCalledWith(
      'Роль створено.',
      expect.any(Object),
    );
  });
});
