import union from 'lodash/union';
import without from 'lodash/without';
import { useTranslation } from 'react-i18next';

import { PermissionCheckbox } from 'modules/access/components/access-workspace/components/roles/PermissionCheckbox';

import type { AccessPermission } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';

type PermissionFieldsetProps = {
  isDisabled: boolean;
  permissions: AccessPermission[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
};

/**
 * The Permissions a Role grants, as the create dialog and the inline editor
 * both present them. The reserved Permission is never selectable from either,
 * so the rule lives here rather than in each caller.
 */
export const PermissionFieldset = ({
  isDisabled,
  permissions,
  selectedIds,
  onChange,
}: PermissionFieldsetProps): ReactElement => {
  const { t } = useTranslation('access');

  const onTogglePermission =
    (permissionId: string) =>
    (isSelected: boolean): void =>
      onChange(
        isSelected
          ? union(selectedIds, [permissionId])
          : without(selectedIds, permissionId),
      );

  return (
    <fieldset className="space-y-3">
      <legend className="font-semibold">
        {t('administration.roleEditor.permissions')}
      </legend>
      <p className="pb-2 text-sm text-muted">
        {t('administration.roleEditor.hint')}
      </p>
      <ul className="space-y-3">
        {permissions.map((permission) => (
          <PermissionCheckbox
            key={permission.id}
            isDisabled={isDisabled || permission.kind === 'reserved'}
            isSelected={selectedIds.includes(permission.id)}
            permission={permission}
            onChange={onTogglePermission(permission.id)}
          />
        ))}
      </ul>
    </fieldset>
  );
};
