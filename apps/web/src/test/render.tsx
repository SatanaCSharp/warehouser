import { HeroUIProvider } from '@heroui/react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';

import { makeStore } from 'store';

import type { RenderResult } from '@testing-library/react';
import type React from 'react';
import type { AppStore } from 'store';

/**
 * Renders `ui` inside `HeroUIProvider` (and, when a `store` is supplied, a
 * Redux `Provider`), matching the production render tree in main.tsx
 * (`Provider` outside `HeroUIProvider`) so tests exercise the same context
 * HeroUI components see at runtime.
 */
export const renderWithProviders = (
  ui: React.ReactElement,
  store: AppStore = makeStore(),
): RenderResult => {
  const tree = <HeroUIProvider>{ui}</HeroUIProvider>;
  return render(<Provider store={store}>{tree}</Provider>);
};
