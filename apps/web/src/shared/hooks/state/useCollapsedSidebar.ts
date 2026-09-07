import { useState } from 'react';

/**
 * Where the preference is kept. Namespaced by application so a second key added
 * later cannot collide with it, and stated once here rather than at each of the
 * two access points below.
 */
const STORAGE_KEY = 'warehouser.sidebar.collapsed';

export type CollapsedSidebar = {
  /** Whether the wide navigation list is reduced to its icon rail. */
  isCollapsed: boolean;
  /** Moves between the two widths, recording the choice for the next visit. */
  toggle: () => void;
};

/**
 * Both accesses are wrapped, because a browser that refuses storage — private
 * mode, a blocked third-party context, a quota that is already full — throws
 * from `localStorage` rather than returning `null`. A remembered width is a
 * convenience; failing the whole shell for it is not a trade this makes, so a
 * refusal reads as "not collapsed" and a failed write is dropped.
 */
const storedCollapse = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const storeCollapse = (isCollapsed: boolean): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(isCollapsed));
  } catch {
    // See above: the preference is not worth an exception reaching the shell.
  }
};

/**
 * Owns whether the desktop sidebar is collapsed to its icon rail, and the one
 * transition over it. The initial value is read lazily from storage, so the
 * first paint after a reload is already the width the actor left behind rather
 * than the default corrected by an effect a frame later.
 *
 * This is deliberately not Redux state: nothing outside the sidebar reads it,
 * and `frontend-architecture.md` §"Redux Toolkit infrastructure" adds a slice
 * only for state used across modules or needed globally across routes.
 */
export const useCollapsedSidebar = (): CollapsedSidebar => {
  const [isCollapsed, setIsCollapsed] = useState(storedCollapse);

  const toggle = (): void => {
    const next = !isCollapsed;
    storeCollapse(next);
    setIsCollapsed(next);
  };

  return { isCollapsed, toggle };
};
