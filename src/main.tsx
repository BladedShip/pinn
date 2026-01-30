import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from './router';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { getTheme, applyTheme } from './lib/themeStorage';
import './index.css';

// Apply theme immediately to prevent flash of unstyled content
applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider />
    </ErrorBoundary>
  </StrictMode>
);
