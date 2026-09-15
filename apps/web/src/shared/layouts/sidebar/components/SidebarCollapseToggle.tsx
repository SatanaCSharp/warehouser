import { Button } from '@heroui/react';
import type { ReactElement } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'shared/icons';

export type SidebarCollapseToggleProps = {
  isCollapsed: boolean;
  /** What the press does next — expand from the rail, or collapse to it. */
  label: string;
  onToggle: () => void;
};

/**
 * The control that moves the wide list to its icon rail and back.
 *
 * It sits above the list it resizes, so the affordance is the first thing in
 * the rail rather than something the actor scrolls a long list to reach — which
 * is why the divider it draws is its bottom edge and it takes no `mt-auto`.
 *
 * Like the list below it, only its horizontal inset answers the width: sitting
 * above everything else, any height it gave back at the rail would move the
 * whole list up with it.
 *
 * It renders only in the persistent sidebar, never in the drawer: the drawer is
 * the narrow-viewport presentation of the same list, and a list that is already
 * an overlay has no second width to offer.
 */
export const SidebarCollapseToggle = ({
  isCollapsed,
  label,
  onToggle,
}: SidebarCollapseToggleProps): ReactElement => {
  // The two directions the control points in, named by the state that selects
  // one, so neither arm is a ternary between elements
  // (`writing-web-components.md` §6).
  const directionIcon: Record<'collapsed' | 'expanded', ReactElement> = {
    collapsed: <ChevronRightIcon />,
    expanded: <ChevronLeftIcon />,
  };

  return (
    <div
      className={`border-b border-border py-4 transition-[padding] duration-200 ease-out motion-reduce:transition-none ${isCollapsed ? 'px-2' : 'px-4'}`}
    >
      <Button
        variant="ghost"
        // `aria-expanded` states what the control does to the list beside it,
        // and the label — visible while there is room, off screen on the rail —
        // is its accessible name either way.
        aria-expanded={!isCollapsed}
        className={`flex w-full items-center gap-2 ${isCollapsed ? 'justify-center px-2' : 'justify-start px-3'}`}
        onPress={onToggle}
      >
        {directionIcon[isCollapsed ? 'collapsed' : 'expanded']}
        <span className={isCollapsed ? 'sr-only' : undefined}>{label}</span>
      </Button>
    </div>
  );
};
