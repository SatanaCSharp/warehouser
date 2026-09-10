import 'src/styles/global.css';

import { Toast } from '@heroui/react';
import App from 'App';
import { i18nReady } from 'i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { toastQueue } from 'shared/alerts/toast';
import { LocaleProvider } from 'shared/components/LocaleProvider';
import { store } from 'store';

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
          {/*
            The region reads the application's own queue (`shared/alerts/toast`)
            rather than the barrel's singleton, so every toast is raised through
            the one seam the adapters and their specs depend on.
          */}
          <Toast.Provider placement="bottom start" queue={toastQueue} />
        </LocaleProvider>
      </Provider>
    </StrictMode>,
  );
}

void bootstrap();
