import { screen } from '@testing-library/react';

import type { UserEvent } from '@testing-library/user-event';

/**
 * HeroUI's `Select` only mounts its listbox once opened, and keeps it
 * `aria-hidden` while its popover is entering (jsdom never resolves that
 * transition), so the open listbox can't be queried with a plain
 * `getByRole('option', ...)`. Clicking the trigger and then the matching
 * `<li role="option">` (found via `{ hidden: true }` and filtered away from
 * the always-present, always-`display:none` native `<option>` HeroUI also
 * renders for form semantics) is the interaction that actually reaches
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
    .find((candidate) => candidate.tagName === 'LI');
  if (!option) {
    throw new Error(`No open HeroUI option named "${optionName}"`);
  }
  await user.click(option);
};
