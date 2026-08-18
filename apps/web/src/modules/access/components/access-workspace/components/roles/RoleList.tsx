import { Chip, InputGroup } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { SearchIcon } from 'shared/icons';

import type { AccessRole } from 'modules/access/types/access.types';
import type { ChangeEvent, ReactElement } from 'react';

type RoleListProps = {
  roles: AccessRole[];
  selectedRoleId?: string;
  onSelect: (roleId: string) => void;
};

/**
 * The searchable Role picker. The search term is local — nothing outside this
 * list reads it.
 */
export const RoleList = ({
  roles,
  selectedRoleId,
  onSelect,
}: RoleListProps): ReactElement => {
  const { t } = useTranslation('access');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRoles = roles.filter((role) =>
    role.name.toLocaleLowerCase().includes(normalizedQuery),
  );

  const onChangeQuery = (event: ChangeEvent<HTMLInputElement>): void =>
    setQuery(event.target.value);

  const onSelectRole = (roleId: string) => (): void => onSelect(roleId);

  return (
    <div>
      <InputGroup className="h-12 border border-border bg-surface shadow-none">
        <InputGroup.Prefix>
          <SearchIcon />
        </InputGroup.Prefix>
        <InputGroup.Input
          aria-label={t('roles.search')}
          placeholder={t('roles.search')}
          value={query}
          onChange={onChangeQuery}
        />
      </InputGroup>
      <ul aria-label={t('roles.listLabel')} className="mt-3 space-y-3">
        {visibleRoles.map((role) => {
          const isSelected = role.id === selectedRoleId;
          return (
            <li key={role.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                className={`w-full rounded-xl border bg-surface p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isSelected ? 'border-2 border-accent' : 'border-border hover:border-accent/40'}`}
                onClick={onSelectRole(role.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{role.name}</span>
                  <Conditional when={role.kind === 'warehouse_manager'}>
                    <Chip color="accent" size="sm" variant="soft">
                      {t('roles.protected')}
                    </Chip>
                  </Conditional>
                </span>
                <span className="mt-2 block text-sm text-muted">
                  {t('roles.memberCount', { count: role.assignedMemberCount })}
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
