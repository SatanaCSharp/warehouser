import { useContext } from 'react';
import { OverlayTriggerStateContext } from 'react-aria-components';

/**
 * Closes the Modal the calling dialog is rendered in.
 *
 * A dialog never owns whether it is open: the state belongs to whatever opened
 * it — a `Modal` root around a trigger, or the `DialogHost` a list mounts for
 * the record a row opened. Both publish that state on the same React Aria
 * context, so a dialog closes itself through this hook without being handed an
 * `onClose` prop, and its owner never has to thread one down.
 *
 * `Modal.CloseTrigger` and `<Button slot="close">` close the same state
 * declaratively; reach for this only where the close is a consequence of
 * something else succeeding.
 */
export const useCloseDialog = (): (() => void) => {
  const state = useContext(OverlayTriggerStateContext);

  if (state === null) {
    throw new Error(
      'useCloseDialog must be called inside a Modal or a DialogHost.',
    );
  }

  // Returned as a call rather than as `state.close` itself: the state object
  // owns the method, and handing the bare reference out would separate it from
  // the object it closes.
  return (): void => state.close();
};
