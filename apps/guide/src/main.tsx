import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// 開発用の入口: ?l1=area1 で館内の L1 の画面の下書きだけを開く（アプリの画面からはまだリンクしない。docs/indoor-plan.md 11 節）
const L1DraftPage = lazy(() => import('./dev/L1DraftPage'));
const l1Area = new URLSearchParams(window.location.search).get('l1');

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      {l1Area ? (
        <Suspense fallback={null}>
          <L1DraftPage area={l1Area} />
        </Suspense>
      ) : (
        <App />
      )}
    </StrictMode>,
  );
}
