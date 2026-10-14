import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, asyncPersister } from './lib/queryClient.ts'
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistQueryClientProvider client={queryClient}
      persistOptions={{ persister: asyncPersister }}>
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>,
);

// Registro de Service Worker para PWA en entornos de producción
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker activo con scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Error registrando Service Worker:', err);
      });
  });
}