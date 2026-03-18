import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './components/App';
import '../styles/globals.css';

const THEME_KEY = 'app-theme';

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  const effective =
    stored === 'dark' || stored === 'light'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.classList.toggle('dark', effective === 'dark');
}

initTheme();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
}
