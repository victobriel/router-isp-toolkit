import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from '@/ui/modules/popup/components/App';
import '@/ui/styles/globals.css';
import { AppThemeProvider } from '@/ui/hooks/use-app-theme';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AppThemeProvider persistPreference={false}>
        <Popup />
      </AppThemeProvider>
    </StrictMode>,
  );
}
