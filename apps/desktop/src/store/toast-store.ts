import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  /** Shown as a button, e.g. Undo. */
  action?: ToastAction;
  tone: 'info' | 'error';
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, options?: { action?: ToastAction; tone?: Toast['tone'] }) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

/** How long a toast stays; one with an Undo button stays a bit longer. */
export const TOAST_MS = 5000;
export const TOAST_WITH_ACTION_MS = 8000;
const MAX_TOASTS = 3;

let nextId = 1;

/** Small messages at the bottom of the screen ("Task deleted. Undo"). */
export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  show: (message, options = {}) => {
    const id = nextId++;
    const toast: Toast = { id, message, action: options.action, tone: options.tone ?? 'info' };
    // The newest toasts stay; the oldest drop off
    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_TOASTS) }));
    return id;
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
  clear: () => {
    set({ toasts: [] });
  },
}));
