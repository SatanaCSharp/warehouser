import { HeroUIProvider } from '@heroui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { ToastContainer } from 'react-toastify';

import App from 'App';
import { store } from 'store';

import 'react-toastify/dist/ReactToastify.css';
import 'src/styles/global.css';

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
