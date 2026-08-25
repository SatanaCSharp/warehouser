import { Chip, InputGroup } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Conditional } from 'shared/components/Conditional';
import { SearchIcon } from 'shared/icons';

import type { WorkspaceRole } from '@warehouser/contracts/workspaces';
import type { ChangeEvent, ReactElement } from 'react';

type WorkspaceRoleListProps = {
  roles: WorkspaceRole[];
  selectedRoleId?: string;
  onSelect: (workspaceRoleId: string) => void;
};

/**
 * The searchable Workspace Role picker. The search term is local — nothing
 * outside this list reads it. The protected Workspace Owner Role carries a
 * chip, never colour alone.
 */
export const WorkspaceRoleList = ({
  roles,
  selectedRoleId,
  onSelect,
}: WorkspaceRoleListProps): ReactElement => {
  const { t } = useTranslation('access');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRoles = roles.filter((role) =>
    role.name.toLocaleLowerCase().includes(normalizedQuery),
  );
  const hasCustomRole = roles.some((role) => role.kind === 'custom');

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
          aria-label={t('workspaceRoles.search')}
          placeholder={t('workspaceRoles.search')}
          value={query}
          onChange={onChangeQuery}
        />
      </InputGroup>

      <ul aria-label={t('workspaceRoles.listLabel')} className="mt-3 space-y-3">
        {visibleRoles.map((role) => {
          const isSelected = role.id === selectedRoleId;
          return (
            <li key={role.id}>
              <button
                aria-pressed={isSelected}
                className={`w-full rounded-xl border bg-surface p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isSelected ? 'border-2 border-accent' : 'border-border hover:border-accent/40'}`}
                type="button"
                onClick={onSelectRole(role.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{role.name}</span>
                  <Conditional when={role.kind === 'workspace_owner'}>
                    <Chip color="accent" size="sm" variant="soft">
                      {t('workspaceRoles.chips.protected')}
                    </Chip>
                  </Conditional>
                </span>
                <span className="mt-2 block text-sm text-muted">
                  {t('workspaceRoles.memberCount', {
                    count: role.assignedMemberCount,
                  })}
                  {' · '}
                  {t('workspaceRoles.permissionCount', {
                    count: role.workspacePermissionIds.length,
                  })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Conditional when={!hasCustomRole}>
        <p className="mt-3 text-muted">{t('workspaceRoles.empty')}</p>
      </Conditional>
    </div>
  );
};
