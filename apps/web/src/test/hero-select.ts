import { screen } from '@testing-library/react';

import type { UserEvent } from '@testing-library/user-event';

/**
 * HeroUI v3's `Select` mounts its `ListBox` only once the popover opens, and
 * keeps the popover `aria-hidden` while it is entering (jsdom never resolves
 * that transition), so the open list can't be reached with a plain
 * `getByRole('option', ...)`. Clicking the trigger and then the matching
 * option — found via `{ hidden: true }` and filtered down to the interactive
 * `ListBox.Item`, away from the always-`display:none` native `<option>` HeroUI
 * also renders for form semantics — is the interaction that actually reaches
 * React Hook Form's `Controller`.
 */
export const selectHeroOption = async (
  user: UserEvent,
  trigger: HTMLElement,
  optionName: string,
): Promise<void> => {
  await user.click(trigger);
  const option = screen
    .getAllByRole('option', { name: optionName, hidden: true })
    .find((candidate) => candidate.tagName !== 'OPTION');
  if (!option) {
    throw new Error(`No open HeroUI option named "${optionName}"`);
  }
  await user.click(option);
};
