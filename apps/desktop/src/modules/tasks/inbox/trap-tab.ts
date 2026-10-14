import type { KeyboardEvent } from 'react';

const TABBABLE =
  'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside a dialog: from the last control it wraps to the first, and back. */
export function trapTab(event: KeyboardEvent, box: HTMLElement | null) {
  if (event.key !== 'Tab' || !box) return;
  const controls = [...box.querySelectorAll<HTMLElement>(TABBABLE)];
  const first = controls.at(0);
  const last = controls.at(-1);
  if (!first || !last) {
    event.preventDefault();
    box.focus();
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === box)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
