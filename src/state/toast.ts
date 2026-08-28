import { create } from "zustand";
import { uid } from "@/lib/utils";

export type ToastTone = "info" | "success" | "warning";

export interface Toast {
  id: string;
  text: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  notify: (text: string, tone?: ToastTone) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  notify: (text, tone = "success") => {
    const id = uid("toast");
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => get().dismiss(id), 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** Convenience for non-component code (store actions, the copilot). */
export const notify = (text: string, tone?: ToastTone) => useToasts.getState().notify(text, tone);
