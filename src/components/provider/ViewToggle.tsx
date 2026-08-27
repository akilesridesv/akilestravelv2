import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { List, CalendarDays } from "lucide-react";

export type PanelView = "list" | "calendar";

/** Small segmented control to switch a config panel between list and calendar. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: PanelView;
  onChange: (v: PanelView) => void;
}) {
  const opts: { k: PanelView; label: string; icon: ReactNode }[] = [
    { k: "list", label: "Lista", icon: <List className="h-4 w-4" /> },
    { k: "calendar", label: "Calendario", icon: <CalendarDays className="h-4 w-4" /> },
  ];
  return (
    <div className="inline-flex rounded-full border border-border p-0.5">
      {opts.map((o) => (
        <button
          key={o.k}
          type="button"
          onClick={() => onChange(o.k)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition",
            value === o.k ? "bg-ink text-background" : "text-muted-foreground hover:bg-accent"
          )}
        >
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  );
}
