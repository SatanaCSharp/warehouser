import { HeroUIProvider } from '@heroui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { ToastContainer } from 'react-toastify';

import App from 'App';
import { i18nReady } from 'i18n';
import { store } from 'store';

import 'react-toastify/dist/ReactToastify.css';
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
        <HeroUIProvider>
          <App />
          <ToastContainer position="top-right" />
        </HeroUIProvider>
      </Provider>
    </StrictMode>,
  );
}

void bootstrap();
