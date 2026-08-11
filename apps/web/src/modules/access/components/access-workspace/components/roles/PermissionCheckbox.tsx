import { Checkbox } from '@heroui/react';
import { useTranslation } from 'react-i18next';

import { usePermissionLabel } from 'modules/access/hooks/usePermissionLabel';

import type { AccessPermission } from 'modules/access/types/access.types';
import type { ReactElement } from 'react';

type PermissionCheckboxProps = {
  className?: string;
  isDisabled: boolean;
  isSelected: boolean;
  permission: AccessPermission;
  onChange: (isSelected: boolean) => void;
};

/**
 * One Permission a Role may grant. A reserved Permission says why it can never
 * be granted rather than leaving a disabled control unexplained.
 */
export const PermissionCheckbox = ({
  className,
  isDisabled,
  isSelected,
  permission,
  onChange,
}: PermissionCheckboxProps): ReactElement => {
  const { t } = useTranslation('access');
  const permissionLabel = usePermissionLabel();

  return (
    <div className={className}>
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
      {permission.kind === 'reserved' ? (
        <p className="ml-7 text-sm text-muted">
          {t('administration.roleEditor.reserved')}
        </p>
      ) : null}
    </div>
  );
};
