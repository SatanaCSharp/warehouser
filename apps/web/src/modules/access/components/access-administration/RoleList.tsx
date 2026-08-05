import { Chip, Input } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import type { AccessRole } from 'modules/access/types/access-administration.types';
import type { ReactElement } from 'react';

type RoleListProps = {
  query: string;
  roles: AccessRole[];
  selectedRoleId?: string;
  onQueryChange: (query: string) => void;
  onSelect: (roleId: string) => void;
};

const SearchIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    className="size-5 text-foreground-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      d="m21 21-4.35-4.35m2.1-5.4a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
    />
  </svg>
);

export const RoleList = ({
  query,
  roles,
  selectedRoleId,
  onQueryChange,
  onSelect,
}: RoleListProps): ReactElement => {
  const { t } = useTranslation('access');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRoles = roles.filter((role) =>
    role.name.toLocaleLowerCase().includes(normalizedQuery),
  );

  return (
    <div>
      <Input
        aria-label={t('roles.search')}
        placeholder={t('roles.search')}
        value={query}
        onValueChange={onQueryChange}
        classNames={{
          inputWrapper: 'h-12 border border-divider bg-content1 shadow-none',
        }}
        startContent={<SearchIcon />}
      />
      <ul aria-label={t('roles.listLabel')} className="mt-3 space-y-3">
        {visibleRoles.map((role) => {
          const selected = role.id === selectedRoleId;
          return (
            <li key={role.id}>
              <button
                type="button"
                aria-pressed={selected}
                className={`w-full rounded-large border bg-content1 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? 'border-2 border-primary' : 'border-divider hover:border-primary-200'}`}
                onClick={() => onSelect(role.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{role.name}</span>
                  {role.kind === 'warehouse_manager' ? (
                    <Chip color="primary" size="sm" variant="flat">
                      {t('roles.protected')}
                    </Chip>
                  ) : null}
                </span>
                <span className="mt-2 block text-sm text-foreground-500">
                  {t('roles.memberCount', {
                    count: role.assignedMemberCount,
                  })}
                  {' · '}
                  {t('roles.permissionCount', {
                    count: role.permissionIds.length,
                  })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
