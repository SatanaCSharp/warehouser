import { Link } from '@heroui/react';
import { Link as RouterLink } from '@tanstack/react-router';
import { PermissionId } from '@warehouser/shared-types/enums';
import { useTranslation } from 'react-i18next';

import { useGetCurrentAccessQuery } from 'modules/access/api/access-api';
import { ROUTES } from 'shared/constants/routes';

import type { ReactElement } from 'react';

export const Sidebar = (): ReactElement => {
  const { t } = useTranslation('common');
  const currentAccess = useGetCurrentAccessQuery();
  const canReviewAccess = currentAccess.data?.permissionIds.some(
    (permission) =>
      permission === PermissionId.ROLES_WATCH ||
      permission === PermissionId.USERS_WATCH,
  );

  return (
    <nav
      aria-label={t('nav.label')}
      className="hidden w-[240px] shrink-0 border-r border-divider bg-content1 sm:block"
    >
      <ul className="space-y-1 p-4">
        <li>
          <Link
            as={RouterLink}
            to={ROUTES.HOME}
            color="foreground"
            className="flex items-center gap-2 rounded-medium px-3 py-2"
          >
            {t('nav.dashboard')}
          </Link>
        </li>
        {canReviewAccess ? (
          <li>
            <Link
              as={RouterLink}
              to={ROUTES.ACCESS}
              color="foreground"
              className="flex items-center gap-2 rounded-medium px-3 py-2"
            >
              {t('nav.access')}
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
};
