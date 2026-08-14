import { useTranslation } from 'react-i18next';

import { WorkspacePermissionCheckbox } from 'modules/access/components/workspace-administration/roles/WorkspacePermissionCheckbox';

import type { WorkspacePermission } from '@warehouser/contracts/workspaces';
import type { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { ReactElement } from 'react';

type WorkspacePermissionFieldsetProps = {
  isDisabled: boolean;
  permissions: WorkspacePermission[];
  selectedIds: WorkspacePermissionId[];
  onChange: (selectedIds: WorkspacePermissionId[]) => void;
};

/**
 * The Workspace Permissions a custom Workspace Role grants, as the create
 * dialog and the inline editor both present them. The reserved Permission is
 * never selectable from either (AC-18), so the rule lives here rather than in
 * each caller.
 */
export const WorkspacePermissionFieldset = ({
  isDisabled,
  permissions,
  selectedIds,
  onChange,
}: WorkspacePermissionFieldsetProps): ReactElement => {
  const { t } = useTranslation('workspace');

  return (
    <fieldset className="space-y-3">
      <legend className="font-semibold">
        {t('workspaceRoles.editor.permissionsHeading')}
      </legend>
      <p className="pb-2 text-sm text-muted">
        {t('workspaceRoles.editor.permissionsDescription')}
      </p>
      <ul className="space-y-3">
        {permissions.map((permission) => (
          <WorkspacePermissionCheckbox
            key={permission.id}
            isDisabled={isDisabled || permission.kind === 'reserved'}
            isSelected={selectedIds.includes(permission.id)}
            permission={permission}
            onChange={(isSelected) =>
              onChange(
                isSelected
                  ? [...selectedIds, permission.id]
                  : selectedIds.filter((id) => id !== permission.id),
              )
            }
          />
        ))}
      </ul>
    </fieldset>
  );
};
