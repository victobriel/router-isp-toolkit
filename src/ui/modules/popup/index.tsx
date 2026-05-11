import { AppThemeProvider } from '@/ui/hooks/use-app-theme';
import '@/ui/styles/globals.css';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

const Popup = lazy(() => import('@/ui/modules/popup/App').then((m) => ({ default: m.Popup })));

function PopupFallback() {
  return (
    <div
      className="flex h-screen items-center justify-center bg-background text-muted-foreground text-sm"
      role="status"
      aria-busy="true"
    >
      Loading...
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AppThemeProvider persistPreference={false}>
        <Suspense fallback={<PopupFallback />}>
          <Popup />
        </Suspense>
      </AppThemeProvider>
    </StrictMode>,
  );
}
