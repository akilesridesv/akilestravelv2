import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

/**
 * Adaptive modal: a bottom sheet on mobile, a centered dialog on desktop.
 * Used to view/modify an item (a calendar experience, a booking) without
 * leaving the list.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          "safe-b relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden bg-card shadow-xl",
          "rounded-t-2xl sm:rounded-2xl",
          "animate-sheet-up sm:animate-fade-in"
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="min-w-0 flex-1 truncate font-display text-lg">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto overflow-x-hidden p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
