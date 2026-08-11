import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import i18n from 'i18n';
import {
  LanguageSelector,
  resolveBaseLanguage,
} from 'shared/layouts/LanguageSelector';
import { renderWithProviders } from 'test/render';

describe('resolveBaseLanguage', () => {
  it('resolves a region variant to its base language', () => {
    expect(resolveBaseLanguage('en-US')).toBe('en');
    expect(resolveBaseLanguage('uk-UA')).toBe('uk');
  });

  it('falls back to English for an unresolved language', () => {
    expect(resolveBaseLanguage(undefined)).toBe('en');
  });
});

describe('LanguageSelector', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it("displays i18n's currently resolved language and conveys it in the accessible name", () => {
    renderWithProviders(<LanguageSelector />);

    const trigger = screen.getByRole('button', {
      name: 'Change language: English',
    });
    expect(trigger).toHaveTextContent('English');
  });

  it('re-renders with the new native-name label after the resolved language changes', async () => {
    renderWithProviders(<LanguageSelector />);
    await i18n.changeLanguage('uk');

    const trigger = screen.getByRole('button', {
      name: 'Змінити мову: Українська',
    });
    expect(trigger).toHaveTextContent('Українська');
  });

  it('lists both fixed native-name options and calls changeLanguage on selection', async () => {
    const user = userEvent.setup();
    const changeLanguageSpy = vi.spyOn(i18n, 'changeLanguage');
    renderWithProviders(<LanguageSelector />);

    await user.click(
      screen.getByRole('button', { name: 'Change language: English' }),
    );
    const menu = screen.getByRole('menu');
    expect(
      within(menu).getByRole('menuitem', { name: 'English' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Українська' }),
    ).toBeInTheDocument();

    await user.click(
      within(menu).getByRole('menuitem', { name: 'Українська' }),
    );

    expect(changeLanguageSpy).toHaveBeenCalledWith('uk');
  });

  it('renders the option labels as fixed literal strings, not translation-key lookups', () => {
    const tSpy = vi.spyOn(i18n, 't');
    renderWithProviders(<LanguageSelector />);

    expect(tSpy).not.toHaveBeenCalledWith(
      'language.english',
      expect.anything(),
    );
    expect(tSpy).not.toHaveBeenCalledWith(
      'language.ukrainian',
      expect.anything(),
    );
  });

  it('marks the active language option with a checkmark', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LanguageSelector />);

    await user.click(
      screen.getByRole('button', { name: 'Change language: English' }),
    );
    const menu = screen.getByRole('menu');
    const activeItem = within(menu).getByRole('menuitem', {
      name: 'English',
    });
    const inactiveItem = within(menu).getByRole('menuitem', {
      name: 'Українська',
    });

    expect(activeItem.querySelector('svg')).toBeInTheDocument();
    expect(inactiveItem.querySelector('svg')).not.toBeInTheDocument();
  });

  it('collapses the visible label below the sm breakpoint, keeping the value in the accessible name', () => {
    renderWithProviders(<LanguageSelector />);

    const label = screen.getByText('English');
    expect(label.className).toContain('hidden');
    expect(label.className).toContain('sm:inline');
  });

  it('collapses the trigger to icon-only sizing below sm, matching HeroUI icon-only sizing at sm and above', () => {
    renderWithProviders(<LanguageSelector />);

    const trigger = screen.getByRole('button', {
      name: 'Change language: English',
    });
    expect(trigger.className).toContain('w-10');
    expect(trigger.className).toContain('px-0');
    expect(trigger.className).toContain('sm:w-auto');
    expect(trigger.className).toContain('sm:px-4');
  });
});
