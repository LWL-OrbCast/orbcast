import './polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerWebHip4Runtime } from './lib/webKernel';
import './lib/i18n';
import { App } from './App';
import './index.css';

try {
  registerWebHip4Runtime();
} catch (err) {
  console.error('[web] HIP-4 runtime failed to register', err);
}

const el = document.getElementById('root');
if (!el) {
  throw new Error('Missing #root');
}
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
