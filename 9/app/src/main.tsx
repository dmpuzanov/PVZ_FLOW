import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// §4.2 — SQLite is the only store. There is deliberately no localStorage
// hydration or mirroring here: the provider loads the ledger from /api/state
// and every edit is written back through the API.
const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
