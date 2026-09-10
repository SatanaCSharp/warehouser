import { act, renderHook } from '@testing-library/react';
import { useCollapsedSidebar } from 'shared/hooks/state/useCollapsedSidebar';
import { afterEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'warehouser.sidebar.collapsed';

// Colocated with the hook it belongs to, in the `state/` directory the hook was
// filed into (`placing-web-tests.md` §1, `placing-web-hooks.md` §5).
describe('useCollapsedSidebar', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts expanded when nothing was stored', () => {
    const { result } = renderHook(() => useCollapsedSidebar());

    expect(result.current.isCollapsed).toBe(false);
  });

  it('collapses and expands again on successive toggles', () => {
    const { result } = renderHook(() => useCollapsedSidebar());

    act(() => result.current.toggle());
    expect(result.current.isCollapsed).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.isCollapsed).toBe(false);
  });

  it('records the choice so the next visit starts on the width the actor left', () => {
    const { result, unmount } = renderHook(() => useCollapsedSidebar());

    act(() => result.current.toggle());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');
    unmount();

    expect(
      renderHook(() => useCollapsedSidebar()).result.current.isCollapsed,
    ).toBe(true);
  });

  it('reads a stored expansion as expanded rather than as nothing stored', () => {
    window.localStorage.setItem(STORAGE_KEY, 'false');

    expect(
      renderHook(() => useCollapsedSidebar()).result.current.isCollapsed,
    ).toBe(false);
  });

  // A browser that refuses storage throws from both accesses. Neither is worth
  // failing the shell for, so the hook still works — it just forgets.
  it('starts expanded and still toggles when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is not available');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is not available');
    });

    const { result } = renderHook(() => useCollapsedSidebar());
    expect(result.current.isCollapsed).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.isCollapsed).toBe(true);
  });
});
