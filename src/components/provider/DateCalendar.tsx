import { useRef, useState } from "react";
import type { DateSlot, Experience } from "@/types/domain";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addHours } from "@/ai/nlp";
import { notify } from "@/state/toast";
import { cn, isoDate, todayISO, todayPartsSV, addDaysISO, monthName, uid } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Check, X, CalendarPlus } from "lucide-react";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * Airbnb-style month calendar for one experience. Drag across days to select a
 * range, then enable (with a chosen time + capacity) or remove those dates.
 * Concrete dates are stored as date_slots, layered over the weekly pattern.
 */
type CalendarExperience = Pick<
  Experience,
  "date_slots" | "max_capacity" | "duration_hours" | "tiers"
>;

export function DateCalendar({
  experience,
  onChange,
}: {
  experience: CalendarExperience;
  onChange: (slots: DateSlot[]) => void;
}) {
  const slots = experience.date_slots ?? [];
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const t = todayPartsSV();
    return { y: t.y, m: t.m };
  });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const anchor = useRef<string | null>(null);
  const [time, setTime] = useState("09:00");
  const [capacity, setCapacity] = useState(experience.max_capacity || 10);
  const [tierSel, setTierSel] = useState<Set<string>>(
    () => new Set(experience.tiers.map((t) => t.id))
  );

  function toggleTier(id: string) {
    setTierSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const slotByDate = new Map(slots.map((s) => [s.slot_date, s]));

  const first = new Date(cursor.y, cursor.m, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(cursor.y, cursor.m, d)));

  function rangeBetween(a: string, b: string): string[] {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const out: string[] = [];
    let cur = lo;
    while (cur <= hi) {
      out.push(cur);
      cur = addDaysISO(cur, 1);
    }
    return out;
  }

  function begin(date: string) {
    if (date < today) return;
    anchor.current = date;
    setDragging(true);
    setSelection(new Set([date]));
  }
  function extend(date: string) {
    if (!dragging || !anchor.current || date < today) return;
    setSelection(new Set(rangeBetween(anchor.current, date)));
  }
  function onMove(e: React.PointerEvent) {
    if (!dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const date = el?.closest("[data-date]")?.getAttribute("data-date");
    if (date) extend(date);
  }

  function apply(action: "open" | "remove") {
    const picked = selection;
    let next = slots.map((s) => ({ ...s }));
    if (action === "remove") {
      next = next.filter((s) => !picked.has(s.slot_date));
    } else {
      const tierIds = experience.tiers.length ? [...tierSel] : undefined;
      for (const date of picked) {
        const existing = next.find((s) => s.slot_date === date);
        const end = addHours(time, experience.duration_hours);
        if (existing) {
          existing.start_time = time;
          existing.end_time = end;
          existing.capacity = capacity;
          existing.status = "open";
          existing.tier_ids = tierIds;
        } else {
          next.push({
            id: uid("ds"),
            slot_date: date,
            start_time: time,
            end_time: end,
            capacity,
            status: "open",
            tier_ids: tierIds,
          });
        }
      }
    }
    onChange(next);
    const n = picked.size;
    notify(
      action === "remove"
        ? `Quitaste ${n} fecha${n === 1 ? "" : "s"}.`
        : `Habilitaste ${n} fecha${n === 1 ? "" : "s"} a las ${time}.`
    );
    setSelection(new Set());
  }

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-display text-lg capitalize">
          {monthName(cursor.m)} {cursor.y}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-1"
        style={{ touchAction: "none" }}
        onPointerMove={onMove}
        onPointerUp={() => setDragging(false)}
        onPointerLeave={() => setDragging(false)}
      >
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} />;
          const slot = slotByDate.get(date);
          const isOpen = slot && slot.status === "open";
          const isPast = date < today;
          const isSel = selection.has(date);
          const dayNum = parseInt(date.slice(8), 10);
          return (
            <button
              key={date}
              data-date={date}
              type="button"
              disabled={isPast}
              onPointerDown={() => begin(date)}
              onPointerEnter={() => extend(date)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition",
                isPast && "cursor-not-allowed text-muted-foreground/30",
                !isPast && !isOpen && !isSel && "hover:bg-accent",
                isOpen && !isSel && "bg-primary/20 text-ink ring-1 ring-primary/40",
                isSel && "bg-primary text-ink ring-2 ring-primary"
              )}
            >
              <span className={cn(isOpen && "font-medium")}>{dayNum}</span>
              {isOpen && !isSel && (
                <span className="text-[9px] leading-none text-muted-foreground">{slot!.start_time}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-primary/20 ring-1 ring-primary/40" /> Con salida
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-primary" /> Seleccionado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-border" /> Sin salida
        </span>
      </div>

      {selection.size > 0 ? (
        <div className="mt-3 rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-sm font-medium">
            {selection.size} fecha{selection.size === 1 ? "" : "s"} seleccionada
            {selection.size === 1 ? "" : "s"}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Hora</span>
              <Input
                type="time"
                className="h-9 w-36 px-3"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Cupo</span>
              <Input
                type="number"
                className="h-9 w-20"
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value) || 1)}
              />
            </label>
          </div>

          {experience.tiers.length > 0 && (
            <div className="mt-3">
              <span className="mb-1 block text-xs text-muted-foreground">
                Tiers disponibles en estas fechas
              </span>
              <div className="flex flex-wrap gap-1.5">
                {experience.tiers.map((t) => {
                  const active = tierSel.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTier(t.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs transition",
                        active
                          ? "bg-primary/20 text-ink ring-1 ring-primary"
                          : "border border-border text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {t.tier_name || "Sin nombre"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => apply("open")}>
              <Check className="h-4 w-4" /> Habilitar
            </Button>
            <Button size="sm" variant="outline" onClick={() => apply("remove")}>
              <X className="h-4 w-4" /> Quitar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection(new Set())}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarPlus className="h-3.5 w-3.5" /> Arrastra sobre los días para seleccionar y habilitar
          o quitar fechas.
        </p>
      )}
    </div>
  );
}
