import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Settings } from './components/App';
import '../styles/globals.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Settings />
    </StrictMode>,
  );
}
