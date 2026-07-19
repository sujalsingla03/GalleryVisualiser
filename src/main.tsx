import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { applyStoredTheme } from './store/spacePrefsStore';

applyStoredTheme();

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[GallerySphere] SW registration failed', err);
    });
  });
}
