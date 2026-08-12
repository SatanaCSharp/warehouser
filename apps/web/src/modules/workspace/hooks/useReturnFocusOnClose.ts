import { useEffect, useRef } from 'react';

import type { RefObject } from 'react';

/**
 * Returns focus to the control that opened a dialog once the dialog has
 * actually closed (design-handoff.md §Accessibility).
 *
 * The restore runs in the effect's cleanup, after the Modal has unmounted and
 * its own focus trap has released — calling `.focus()` synchronously inside a
 * close handler races that trap and loses. Attach the returned ref to the
 * trigger and pass whether its dialog is open.
 */
export const useReturnFocusOnClose = (
  isOpen: boolean,
): RefObject<HTMLButtonElement | null> => {
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const trigger = triggerRef.current;
    return () => trigger?.focus();
  }, [isOpen]);

  return triggerRef;
};
