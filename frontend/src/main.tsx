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