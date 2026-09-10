import { Checkbox, Chip } from '@heroui/react';
import type { WorkspacePermission } from '@warehouser/contracts/workspaces';
import { useWorkspacePermissionLabel } from 'modules/access/hooks/projections/useWorkspacePermissionLabel';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';

type WorkspacePermissionCheckboxProps = {
  isDisabled: boolean;
  isSelected: boolean;
  permission: WorkspacePermission;
  onChange: (isSelected: boolean) => void;
};

// Checked rows read as granted, unchecked ones as the neutral surface, and a
// row nobody may change is dimmed further (design-handoff.md §Component
// mapping, `woPxV`).
const rowClassName = (isGranted: boolean, isDisabled: boolean): string => {
  if (isGranted) {
    return 'rounded-lg bg-accent-soft px-3 py-3';
  }
  return isDisabled
    ? 'rounded-lg bg-surface-secondary/70 px-3 py-3'
    : 'rounded-lg bg-surface-secondary px-3 py-3';
};

/**
 * One Workspace Permission a custom Workspace Role may grant. The reserved
 * Permission is disabled, carries the `Owner only` chip and states why it can
 * never be granted, rather than leaving a dimmed control unexplained (AC-18).
 */
export const WorkspacePermissionCheckbox = ({
  isDisabled,
  isSelected,
  permission,
  onChange,
}: WorkspacePermissionCheckboxProps): ReactElement => {
  const { t } = useTranslation('access');
  const permissionLabel = useWorkspacePermissionLabel();
  const isReserved = permission.kind === 'reserved';

  return (
    <li className={rowClassName(isSelected, isDisabled)}>
      <div className="flex items-center justify-between gap-3">
        <Checkbox
          isDisabled={isDisabled}
          isSelected={isSelected}
          onChange={onChange}
        >
          <Checkbox.Content>
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <span className="font-medium">{permissionLabel(permission)}</span>
          </Checkbox.Content>
        </Checkbox>
        <Conditional when={isReserved}>
          <Chip size="sm" variant="soft">
            {t('workspacePermissions.ownerOnly')}
          </Chip>
        </Conditional>
      </div>
      <Conditional when={isReserved}>
        <p className="ml-7 text-sm text-muted">
          {t('workspacePermissions.reservedNote')}
        </p>
      </Conditional>
    </li>
  );
};
