import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Minimum advance-booking time per experience (registration_deadline_hours),
 * editable in hours or days.
 */
export function DeadlineControl({
  hours,
  onChange,
}: {
  hours: number;
  onChange: (hours: number) => void;
}) {
  const useDays = hours % 24 === 0 && hours >= 24;
  const unit: "h" | "d" = useDays ? "d" : "h";
  const amount = useDays ? hours / 24 : hours;

  function setAmount(v: number) {
    onChange(unit === "d" ? Math.max(0, v) * 24 : Math.max(0, v));
  }
  function setUnit(u: "h" | "d") {
    if (u === unit) return;
    onChange(u === "d" ? Math.max(1, Math.round(hours / 24)) * 24 : hours);
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0}
        className="h-10 w-24"
        value={amount}
        onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
      />
      <div className="inline-flex overflow-hidden rounded-xl border border-input">
        {(["h", "d"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            className={cn(
              "px-3 py-2 text-sm transition",
              unit === u ? "bg-ink text-background" : "bg-card text-muted-foreground hover:bg-accent"
            )}
          >
            {u === "h" ? "horas" : "días"}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">antes del inicio</span>
    </div>
  );
}
