import '../src/styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Gallery } from './gallery';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
