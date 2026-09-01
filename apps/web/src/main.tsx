import { Toast } from '@heroui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import App from 'App';
import { i18nReady } from 'i18n';
import { LocaleProvider } from 'shared/components/LocaleProvider';
import { store } from 'store';

import 'src/styles/global.css';

async function bootstrap(): Promise<void> {
  await i18nReady;

  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root element not found');
  }

  createRoot(root).render(
    <StrictMode>
      <Provider store={store}>
        <LocaleProvider>
          <App />
          <Toast.Provider placement="bottom start" />
        </LocaleProvider>
      </Provider>
    </StrictMode>,
  );
}

void bootstrap();
