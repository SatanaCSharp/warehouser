import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';
import type { OverlayTriggerState } from 'react-aria-components';
import { OverlayTriggerStateContext } from 'react-aria-components';

type DialogHostProps = {
  /** The dialog to host. It is open from the moment this mounts. */
  children: ReactNode;
  /** Reported once the dialog has closed, however it was dismissed. */
  onClose: () => void;
};

/**
 * Opens a dialog that has no trigger of its own.
 *
 * A `Modal` root owns the open state wherever a control sits beside the dialog
 * it opens. A list row cannot: the dialog it opens is mounted for the record it
 * was opened for, and that record — not a boolean — is what the list holds.
 * This publishes the open state a trigger would otherwise have owned, on the
 * context every React Aria overlay reads, so the dialog still closes itself
 * through `useCloseDialog` or `<Button slot="close">`, and the close is
 * reported back once — where the record it was opened for is dropped.
 *
 * `point` is the cursor position a menu or a popover opens at. A modal is not
 * positioned from one and never reads it, but the contract carries it, so it
 * is held here rather than stubbed out.
 */
export const DialogHost = ({
  children,
  onClose,
}: DialogHostProps): ReactElement => {
  const [isOpen, setIsOpen] = useState(true);
  const [point, setPoint] = useState<OverlayTriggerState['point']>(null);

  const setOpen = (open: boolean): void => {
    setIsOpen(open);
    if (!open) {
      onClose();
    }
  };

  const open = (): void => setOpen(true);

  const close = (): void => setOpen(false);

  const toggle = (): void => setOpen(!isOpen);

  const state: OverlayTriggerState = {
    isOpen,
    setOpen,
    open,
    close,
    toggle,
    point,
    setPoint,
  };

  return (
    <OverlayTriggerStateContext value={state}>
      {children}
    </OverlayTriggerStateContext>
  );
};
