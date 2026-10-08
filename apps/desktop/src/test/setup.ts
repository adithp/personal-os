import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom does not implement scrolling; the router calls it on navigation
if (typeof window !== 'undefined') {
  window.scrollTo = () => undefined;
  // jsdom lacks these; the command palette (cmdk) uses them
  Element.prototype.scrollIntoView = () => undefined;
  window.ResizeObserver = class {
    observe() {
      /* nothing to observe in tests */
    }
    unobserve() {
      /* nothing to observe in tests */
    }
    disconnect() {
      /* nothing to observe in tests */
    }
  };
}

afterEach(() => {
  cleanup();
});
