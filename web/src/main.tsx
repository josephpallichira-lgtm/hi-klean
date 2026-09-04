import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './app/Root';
import './styles/app.css';

/** Offline / no-internet banner, kept outside React so it survives any render error. */
window.addEventListener('offline', () => {
  if (document.querySelector('.offline')) return;
  const d = document.createElement('div');
  d.className = 'offline';
  d.textContent = 'No internet — the app cannot save until the connection is back.';
  document.body.appendChild(d);
});
window.addEventListener('online', () => document.querySelector('.offline')?.remove());

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>,
);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
