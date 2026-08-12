import { Button, Tooltip } from '@heroui/react';

import { PlusIcon } from 'shared/icons';

import type { ReactElement } from 'react';

type CreateActionButtonProps = {
  isDisabled?: boolean;
  label: string;
  /** Exposed as the disabled control's reason (AC-12) — a hover/focus tooltip. */
  reason?: string;
  onPress: () => void;
};

/**
 * Primary "create" trigger of a workspace toolbar: icon-only on narrow
 * viewports, icon plus label from `sm` up, labelled either way.
 */
export const CreateActionButton = ({
  isDisabled = false,
  label,
  reason,
  onPress,
}: CreateActionButtonProps): ReactElement => {
  const button = (
    <Button
      variant="primary"
      aria-label={label}
      className="w-10 min-w-10 gap-0 px-0 font-semibold sm:w-auto sm:min-w-40 sm:gap-2 sm:px-4"
      isDisabled={isDisabled}
      onPress={onPress}
    >
      <PlusIcon />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );

  if (!isDisabled || !reason) {
    return button;
  }

  return (
    <Tooltip delay={0}>
      {button}
      <Tooltip.Content>{reason}</Tooltip.Content>
    </Tooltip>
  );
};
