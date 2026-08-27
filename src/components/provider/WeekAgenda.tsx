import type { Experience } from "@/types/domain";
import { dayName, todayISO, parseISODate } from "@/lib/utils";
import { CalendarDays } from "lucide-react";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

interface Departure {
  expId: string;
  title: string;
  time: string;
  capacity: number;
  tierCount: number;
}

function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function DepartureRow({ d, onSelect }: { d: Departure; onSelect?: (id: string) => void }) {
  const meta = `${d.capacity} cupos${
    d.tierCount ? ` · ${d.tierCount} tier${d.tierCount > 1 ? "s" : ""}` : ""
  }`;
  return (
    <button
      type="button"
      onClick={() => onSelect?.(d.expId)}
      disabled={!onSelect}
      className="w-full rounded-lg border-l-[3px] bg-muted/50 px-2 py-1.5 text-left transition enabled:hover:bg-muted"
      style={{ borderLeftColor: `hsl(${hueFor(d.expId)} 70% 55%)` }}
    >
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 font-display text-sm tabular-nums">{d.time}</span>
        <span className="min-w-0 flex-1 break-words text-sm">{d.title}</span>
      </div>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">{meta}</span>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{text}</p>
    </div>
  );
}

/** Weekly (Mon→Sun) overview of the recurring departures. */
export function WeekAgenda({
  experiences,
  onSelect,
}: {
  experiences: Experience[];
  onSelect?: (expId: string) => void;
}) {
  const byDay = (day: number): Departure[] =>
    experiences
      .flatMap((e) =>
        e.schedules
          .filter((s) => s.day_of_week === day)
          .map((s) => ({
            expId: e.id,
            title: e.title,
            time: s.start_time,
            capacity: s.capacity,
            tierCount: s.tier_ids?.length ?? e.tiers.length,
          }))
      )
      .sort((a, b) => a.time.localeCompare(b.time));

  const total = experiences.reduce((n, e) => n + e.schedules.length, 0);
  if (total === 0) return <Empty text="Sin salidas recurrentes" />;

  return (
    <div className="grid gap-2">
      {DAY_ORDER.map((day) => {
        const deps = byDay(day);
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
                deps.map((d, i) => <DepartureRow key={i} d={d} onSelect={onSelect} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Today's departures: recurring schedules matching today + concrete date_slots. */
export function TodayAgenda({
  experiences,
  onSelect,
}: {
  experiences: Experience[];
  onSelect?: (expId: string) => void;
}) {
  const iso = todayISO();
  const dow = parseISODate(iso).getDay();

  const deps: Departure[] = experiences.flatMap((e) => {
    const fromRecurring = e.schedules
      .filter((s) => s.day_of_week === dow)
      .map((s) => ({
        expId: e.id,
        title: e.title,
        time: s.start_time,
        capacity: s.capacity,
        tierCount: s.tier_ids?.length ?? e.tiers.length,
      }));
    const fromDates = (e.date_slots ?? [])
      .filter((s) => s.slot_date === iso && s.status === "open")
      .map((s) => ({
        expId: e.id,
        title: e.title,
        time: s.start_time,
        capacity: s.capacity,
        tierCount: e.tiers.length,
      }));
    return [...fromRecurring, ...fromDates];
  });

  const seen = new Set<string>();
  const unique = deps
    .filter((d) => {
      const k = `${d.expId}-${d.time}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.time.localeCompare(b.time));

  const label = `${dayName(dow)} ${parseISODate(iso).getDate()}`;

  return (
    <div className="flex gap-3 rounded-xl border border-border bg-card p-3">
      <div className="w-16 shrink-0 pt-0.5">
        <p className="text-sm font-medium capitalize">Hoy</p>
        <p className="text-[11px] capitalize text-muted-foreground">{label}</p>
      </div>
      <div className="grid min-w-0 flex-1 gap-1.5">
        {unique.length === 0 ? (
          <span className="text-sm text-muted-foreground/60">Sin salidas hoy</span>
        ) : (
          unique.map((d, i) => <DepartureRow key={i} d={d} onSelect={onSelect} />)
        )}
      </div>
    </div>
  );
}
