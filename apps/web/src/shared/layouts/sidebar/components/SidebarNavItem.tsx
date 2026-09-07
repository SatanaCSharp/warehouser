import { Link as RouterLink } from '@tanstack/react-router';

import type { ReactElement, ReactNode } from 'react';

export type SidebarNavItemProps = {
  /** The address pattern from `ROUTES` this entry navigates to. */
  to: string;
  /** The path params that pattern names, when it names any. */
  params?: Record<string, string>;
  /** Whether this entry addresses the destination currently on screen. */
  isActive: boolean;
  /**
   * Whether the list is reduced to its icon rail. The label is never dropped
   * when it is — it is taken off screen — so the entry keeps the accessible
   * name a wide list gives it, and a pointer still reaches it through the
   * native hint.
   */
  isCollapsed: boolean;
  icon: ReactNode;
  label: string;
  onNavigate?: () => void;
};

/** The two widths the list is offered at, named so neither arm is a ternary. */
type NavItemWidth = 'collapsed' | 'expanded';

/**
 * One nav entry, at either width: an icon, and a label that is on screen in the
 * wide list and off screen on the rail.
 *
 * **An entry carries nothing after its label.** It used to offer a `trailing`
 * slot, which existed for one thing — the `Purchase drafts` drift count — and
 * that count has since been withdrawn from the shell. The slot went with it
 * rather than staying as an extension point with no extension: it was what
 * forced the two anchored-`Badge` layouts this file used to hold, one per
 * width, and a row that carries only an icon and a label needs neither.
 *
 * The icons still carry `shrink-0` of their own. `size-5` is a flex *basis*,
 * not a floor, so anything of its own min-content width sharing an entry's line
 * takes width out of the icon — which is exactly how the count once drew the
 * `Purchase drafts` glyph smaller than its neighbours'. Nothing shares that
 * line today; the refusal to shrink is what keeps a slot added later from
 * reintroducing the squeeze one entry at a time.
 */
export const SidebarNavItem = ({
  to,
  params,
  isActive,
  isCollapsed,
  icon,
  label,
  onNavigate,
}: SidebarNavItemProps): ReactElement => {
  const stateClassName = isActive
    ? 'bg-accent-soft text-accent-soft-foreground'
    : 'text-foreground hover:bg-surface-hover';
  const widthClassName = isCollapsed ? 'justify-center px-2' : 'px-3';
  const width: NavItemWidth = isCollapsed ? 'collapsed' : 'expanded';

  // Both arms are built and one is rendered, which costs nothing: creating an
  // element runs no hook and has no effect
  // (`writing-web-conditional-components.md` §3).
  const labelSlot: Record<NavItemWidth, ReactNode> = {
    collapsed: <span className="sr-only">{label}</span>,
    expanded: <span>{label}</span>,
  };

  return (
    <li>
      <RouterLink
        to={to}
        params={params}
        // The label is the entry's whole name at both widths, stated rather
        // than composed from the row's contents, so the rail's `sr-only` span
        // and the wide list's visible one announce the destination identically.
        aria-label={label}
        // `h-10` rather than a vertical padding around whatever the row happens
        // to contain. On the rail the label is `sr-only` — absolutely
        // positioned, contributing no height — so a content-sized row collapsed
        // from the label's 24px line box to the icon's 20px, and every entry
        // below crept up by 4px as the list narrowed. Fixing the height keeps
        // each entry on its own line through the transition.
        className={`flex h-10 items-center gap-2 rounded-lg ${widthClassName} ${stateClassName}`}
        // The rail has no room for the label, so the pointer affordance the
        // platform already provides stands in for it. It is a hint, not the
        // name: the name is the `aria-label` above, and the `sr-only` span the
        // rail keeps means the label is taken off screen rather than dropped.
        title={isCollapsed ? label : undefined}
        onClick={onNavigate}
      >
        {icon}
        {labelSlot[width]}
      </RouterLink>
    </li>
  );
};
