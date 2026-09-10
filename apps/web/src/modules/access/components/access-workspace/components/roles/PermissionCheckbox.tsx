import { Checkbox } from '@heroui/react';
import { usePermissionLabel } from 'modules/access/hooks/projections/usePermissionLabel';
import type { AccessPermission } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';

type PermissionCheckboxProps = {
  isDisabled: boolean;
  isSelected: boolean;
  permission: AccessPermission;
  onChange: (isSelected: boolean) => void;
};

// Checked rows read as granted, unchecked ones as the neutral surface, and a
// row nobody may change is dimmed further — the same three states the Workspace
// Permission rows use, so both Role editors read alike.
const rowClassName = (isGranted: boolean, isDisabled: boolean): string => {
  if (isGranted) {
    return 'rounded-lg bg-accent-soft px-3 py-3';
  }
  return isDisabled
    ? 'rounded-lg bg-surface-secondary/70 px-3 py-3'
    : 'rounded-lg bg-surface-secondary px-3 py-3';
};

/**
 * One Permission a Role may grant. A reserved Permission says why it can never
 * be granted rather than leaving a disabled control unexplained.
 *
 * It renders its own row — the styling that marks granted, neutral and locked —
 * so no caller restates it, and is a list item because the fieldset that owns
 * it presents the Permissions as a list.
 */
export const PermissionCheckbox = ({
  isDisabled,
  isSelected,
  permission,
  onChange,
}: PermissionCheckboxProps): ReactElement => {
  const { t } = useTranslation('access');
  const permissionLabel = usePermissionLabel();

  return (
    <li className={rowClassName(isSelected, isDisabled)}>
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
      <Conditional when={permission.kind === 'reserved'}>
        <p className="ml-7 text-sm text-muted">
          {t('administration.roleEditor.reserved')}
        </p>
      </Conditional>
    </li>
  );
};
