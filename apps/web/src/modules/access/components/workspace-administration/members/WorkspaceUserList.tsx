import { Chip } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { WorkspaceUser } from '@warehouser/contracts/workspaces';
import type { ReactElement } from 'react';

type WorkspaceUserListProps = { users: WorkspaceUser[] };

/**
 * Everyone in this Workspace who holds no Workspace Role — the people a
 * Workspace membership can be given to. Someone in no Warehouse of this
 * Workspace carries the reason they cannot be added yet, so the constraint is
 * stated before the add dialog silently omits them (AC-20).
 *
 * It names the Warehouses nobody belongs to, never the Role anyone holds inside
 * one: this read carries no Warehouse Role at all (AC-31, AC-33).
 */
export const WorkspaceUserList = ({
  users,
}: WorkspaceUserListProps): ReactElement | null => {
  const { t } = useTranslation('access');
  const others = users.filter((user) => !user.isWorkspaceMember);

  if (others.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold">
        {t('workspaceMembers.everyone.heading')}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {t('workspaceMembers.everyone.description')}
      </p>

      <ul
        aria-label={t('workspaceMembers.everyone.heading')}
        className="mt-3 space-y-2"
      >
        {others.map((user) => (
          <li
            className="rounded-lg border border-border bg-surface p-3"
            key={user.userId}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{user.email ?? user.userId}</span>
              {user.warehouses.length === 0 ? (
                <Chip size="sm" variant="soft">
                  {t('workspaceMembers.everyone.noWarehouse')}
                </Chip>
              ) : null}
            </div>
            {user.warehouses.length === 0 ? (
              <p className="mt-1 text-sm text-muted">
                {t('workspaceMembers.everyone.blockedNote', {
                  name: user.email ?? user.userId,
                })}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
};
