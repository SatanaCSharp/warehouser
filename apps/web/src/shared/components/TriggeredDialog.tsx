import type { ReactNode } from 'react';
import { useContext } from 'react';
import { OverlayTriggerStateContext } from 'react-aria-components';

type TriggeredDialogProps = {
  /** The dialog the surrounding `Modal`'s trigger opens. */
  children: ReactNode;
};

/**
 * Mounts the dialog of the `Modal` it sits in only while that Modal is open.
 *
 * The trigger and its dialog are written side by side, but the dialog's reads,
 * form state and validation must begin when an actor opens it — not when the
 * control that offers it renders. Because a dialog exists only while open, it
 * still seeds itself from what it was opened for and needs no reset
 * (`writing-web-components.md` §8). Its triggerless counterpart is
 * `DialogHost`, which mounts a dialog a list row opened.
 */
export const TriggeredDialog = ({
  children,
}: TriggeredDialogProps): ReactNode => {
  const state = useContext(OverlayTriggerStateContext);

  return state?.isOpen === true ? children : null;
};
