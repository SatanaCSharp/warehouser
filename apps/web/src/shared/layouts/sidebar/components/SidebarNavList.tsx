import type { ReactElement, ReactNode } from 'react';

export type SidebarNavListProps = {
  /**
   * Whether the list is reduced to its icon rail. It decides the list's own
   * padding and nothing else — an entry reads its own width from the prop the
   * entries component hands it.
   */
  isCollapsed: boolean;
  /** The entries of the entered context, supplied as `<li>` elements. */
  children: ReactNode;
};

/**
 * The navigation list's chrome, and the sole owner of the `<ul>` every sidebar
 * entry sits in.
 *
 * Both contexts' entry sets used to re-write this element and its two paddings
 * for themselves, so a change to the rail's inset had to be made twice and
 * could be made in one place only. What differs between the Warehouse view and
 * the Workspace view is which entries the list *contains*, never how the list
 * itself is drawn — so the container is written once here and the entries are
 * passed in as children.
 */
export const SidebarNavList = ({
  isCollapsed,
  children,
}: SidebarNavListProps): ReactElement => (
  // Only the HORIZONTAL inset answers the width. The vertical one is fixed at
  // `py-4`, so the first entry sits on the same line before and after the
  // transition: an inset that shrank in both axes moved every entry up by the
  // 8px it gave back at the top, and the list appeared to jump rather than
  // narrow.
  <ul
    className={`space-y-1 py-4 transition-[padding] duration-200 ease-out motion-reduce:transition-none ${isCollapsed ? 'px-2' : 'px-4'}`}
  >
    {children}
  </ul>
);
