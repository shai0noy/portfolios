import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { HashRouter } from 'react-router-dom';
import { LanguageProvider } from './lib/i18n';

// Enforce trailing slash on base path for cleaner URLs with HashRouter
if (!window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('.html')) {
  const newPath = window.location.pathname + '/' + window.location.hash;
  window.history.replaceState(null, '', newPath);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </HashRouter>
  </StrictMode>,
)