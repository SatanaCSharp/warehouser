import { Button } from '@heroui/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Conditional } from 'shared/components/Conditional';
import { useHasNavigationList } from 'shared/hooks/projections/useHasNavigationList';
import { MenuIcon } from 'shared/icons';

export type NavigationDrawerToggleProps = {
  /** Opens the sidebar's off-canvas drawer, whose open state the shell owns. */
  onOpen: () => void;
};

/**
 * T11 / CR-AC-18 — the narrow-viewport control that opens the sidebar's
 * off-canvas drawer, offered exactly when there is a list for that drawer to
 * contain.
 *
 * It asks the question itself rather than taking the answer as a prop, for the
 * two reasons `writing-web-conditional-components.md` §4 gives: the rule stays
 * beside the control it governs, and the shell that renders the toggle is left
 * with no navigation predicate of its own to drift from the rail's. Both this
 * control and `Sidebar` read `useHasNavigationList`, which counts the entries
 * the rail would render — so the shell cannot offer a control that opens an
 * empty drawer.
 *
 * Self-gating also keeps the question out of the shells that have no sidebar at
 * all: the root builds all three of its shell elements and renders one, and
 * creating an element runs no hook, so the Workspace-context read behind the
 * count is never issued on the anonymous or sign-in shells.
 */
export const NavigationDrawerToggle = ({
  onOpen,
}: NavigationDrawerToggleProps): ReactNode => {
  const { t } = useTranslation('common');
  const hasNavigationList = useHasNavigationList();

  return (
    <Conditional when={hasNavigationList}>
      <Button
        isIconOnly
        variant="ghost"
        aria-label={t('nav.toggle')}
        className="sm:hidden"
        onPress={onOpen}
      >
        <MenuIcon />
      </Button>
    </Conditional>
  );
};
