// Composition root: the only place that knows which adapters back which ports.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ServicesProvider } from './application/services.jsx';
import { localStorageAdapter } from './infrastructure/localStorageAdapter.js';
import { localCatalog } from './infrastructure/localCatalog.js';
import { apiAdapter } from './infrastructure/apiAdapter.js';
import { App } from './ui/App.jsx';
import './ui/styles/modernist.css';
import './ui/styles/app.css';

const services = { storage: localStorageAdapter, catalog: localCatalog, api: apiAdapter };

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ServicesProvider services={services}><App /></ServicesProvider>
  </StrictMode>,
);
