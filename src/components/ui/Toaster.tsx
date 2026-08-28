import { useToasts } from "@/state/toast";
import { cn } from "@/lib/utils";
import { Check, Info, AlertTriangle, X } from "lucide-react";

const icons = {
  success: <Check className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
};

/** Fixed stack of transient notifications; mount once near the app root. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="safe-b pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-3 py-2.5 shadow-lg animate-fade-in",
            t.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
            t.tone === "info" && "border-border bg-card text-foreground",
            t.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900"
          )}
        >
          <span className="mt-0.5 shrink-0">{icons[t.tone]}</span>
          <span className="min-w-0 flex-1 text-sm">{t.text}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Cerrar"
            className="shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
