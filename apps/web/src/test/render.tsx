import { HeroUIProvider } from '@heroui/react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';

import type { Store } from '@reduxjs/toolkit';
import type { RenderResult } from '@testing-library/react';
import type React from 'react';

/**
 * Renders `ui` inside `HeroUIProvider` (and, when a `store` is supplied, a
 * Redux `Provider`), matching the production render tree in main.tsx so
 * tests exercise the same context HeroUI components see at runtime.
 */
export const renderWithProviders = (
  ui: React.ReactElement,
  store?: Store,
): RenderResult => {
  const tree = store ? <Provider store={store}>{ui}</Provider> : ui;
  return render(<HeroUIProvider>{tree}</HeroUIProvider>);
};
