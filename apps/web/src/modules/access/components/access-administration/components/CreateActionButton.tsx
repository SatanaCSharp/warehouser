import { Button } from '@heroui/react';

import { PlusIcon } from 'shared/icons';

import type { ReactElement } from 'react';

type CreateActionButtonProps = {
  label: string;
  onPress: () => void;
};

/**
 * Primary "create" trigger of the administration toolbar: icon-only on narrow
 * viewports, icon plus label from `sm` up, labelled either way.
 */
export const CreateActionButton = ({
  label,
  onPress,
}: CreateActionButtonProps): ReactElement => (
  <Button
    variant="primary"
    aria-label={label}
    className="w-10 min-w-10 gap-0 px-0 font-semibold sm:w-auto sm:min-w-40 sm:gap-2 sm:px-4"
    onPress={onPress}
  >
    <PlusIcon />
    <span className="hidden sm:inline">{label}</span>
  </Button>
);
