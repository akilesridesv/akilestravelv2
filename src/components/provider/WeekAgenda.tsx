import type { Experience } from "@/types/domain";
import { dayName } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

interface Departure {
  expId: string;
  title: string;
  time: string;
  capacity: number;
  tierCount: number;
  day: number;
}

/** Stable-ish hue per experience so its departures share a color across the week. */
function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/**
 * Calendar (agenda) view: the week laid out Monday→Sunday, each day showing its
 * departures across all experiences. A comfortable overview of what runs when.
 */
export function WeekAgenda({ experiences }: { experiences: Experience[] }) {
  const departures: Departure[] = experiences.flatMap((e) =>
    e.schedules.map((s) => ({
      expId: e.id,
      title: e.title,
      time: s.start_time,
      capacity: s.capacity,
      tierCount: s.tier_ids?.length ?? e.tiers.length,
      day: s.day_of_week,
    }))
  );

  if (departures.length === 0)
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
        <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Sin salidas en la semana</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Agrega horarios a tus experiencias para verlos aquí.
        </p>
      </div>
    );

  return (
    <div className="grid gap-2">
      {DAY_ORDER.map((day) => {
        const deps = departures
          .filter((d) => d.day === day)
          .sort((a, b) => a.time.localeCompare(b.time));
        return (
          <div key={day} className="flex gap-3 rounded-xl border border-border bg-card p-3">
            <div className="w-14 shrink-0 pt-0.5">
              <p className="text-sm font-medium capitalize">{dayName(day).slice(0, 3)}</p>
              <p className="text-[11px] text-muted-foreground">{deps.length || "—"}</p>
            </div>
            <div className="grid min-w-0 flex-1 gap-1.5">
              {deps.length === 0 ? (
                <span className="text-sm text-muted-foreground/60">Sin salidas</span>
              ) : (
                deps.map((d, i) => {
                  const hue = hueFor(d.expId);
                  return (
                    <div
                      key={i}
                      className="rounded-lg border-l-[3px] bg-muted/50 px-2 py-1.5"
                      style={{ borderLeftColor: `hsl(${hue} 70% 55%)` }}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="shrink-0 font-display text-sm tabular-nums">{d.time}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
                      </div>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {d.capacity} cupos{d.tierCount ? ` · ${d.tierCount} tier${d.tierCount > 1 ? "s" : ""}` : ""}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
