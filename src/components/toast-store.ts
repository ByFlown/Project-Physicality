import { create } from 'zustand';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: 'default' | 'success' | 'warn' | 'level';
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-3), { ...toast, id }] });
    window.setTimeout(() => get().dismiss(id), 4500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (t: Omit<Toast, 'id'>) => useToasts.getState().push(t);
