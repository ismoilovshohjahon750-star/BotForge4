import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

// Global error handlers to prevent unhandled white screens & crash loops
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (msg.includes('ResizeObserver') || msg.includes('Script error')) {
      return;
    }
    console.warn('[Global window.onerror caught]:', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    // Prevent unhandled promise rejection from surfacing as uncaught console errors
    event.preventDefault();
    if (event.reason) {
      console.warn('[Global unhandledrejection caught]:', event.reason);
    }
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  try {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  } catch (renderError) {
    console.error('[Fatal Render Error]:', renderError);
    rootElement.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0d1117; color: #fff; font-family: sans-serif; padding: 20px; text-align: center;">
        <div style="max-width: 420px; background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <h2 style="font-size: 18px; margin-bottom: 12px; color: #f87171;">Tizimni ishga tushirishda xatolik</h2>
          <p style="font-size: 14px; color: #8b949e; margin-bottom: 16px;">Brauzeringiz ushbu sahifani yuklashda to'xtab qoldi. Iltimos, sahifani yangilang.</p>
          <button onclick="window.location.reload()" style="background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Qayta yuklash</button>
        </div>
      </div>
    `;
  }
}

