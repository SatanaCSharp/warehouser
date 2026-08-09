import { render } from '@testing-library/react';
import { Provider } from 'react-redux';

import { makeStore } from 'store';

import type { RenderResult } from '@testing-library/react';
import type React from 'react';
import type { AppStore } from 'store';

/**
 * Renders `ui` inside a Redux `Provider`, matching the production render
 * tree in main.tsx.
 */
export const renderWithProviders = (
  ui: React.ReactElement,
  store: AppStore = makeStore(),
): RenderResult => {
  return render(<Provider store={store}>{ui}</Provider>);
};
