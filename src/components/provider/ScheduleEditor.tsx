import type { RecurringSchedule, TicketTier } from "@/types/domain";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { uid, dayName } from "@/lib/utils";
import { addHours } from "@/ai/nlp";
import { Plus, Trash2, Clock } from "lucide-react";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

/**
 * Edit the weekly departures (recurring_schedules). Supports MULTIPLE horarios
 * per day (e.g. Saturday 9:00 and 14:00), each with its own capacity and, when
 * the experience has tiers, which tiers are offered at that departure.
 */
export function ScheduleEditor({
  value,
  onChange,
  tiers,
  durationHours,
  defaultCapacity,
}: {
  value: RecurringSchedule[];
  onChange: (schedules: RecurringSchedule[]) => void;
  tiers: TicketTier[];
  durationHours: number;
  defaultCapacity: number;
}) {
  const sorted = [...value].sort(
    (a, b) =>
      DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week) ||
      a.start_time.localeCompare(b.start_time)
  );

  function update(id: string, patch: Partial<RecurringSchedule>) {
    onChange(
      value.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (patch.start_time) next.end_time = addHours(patch.start_time, durationHours);
        return next;
      })
    );
  }
  function remove(id: string) {
    onChange(value.filter((s) => s.id !== id));
  }
  function add(day: number) {
    const start = "09:00";
    onChange([
      ...value,
      {
        id: uid("sch"),
        day_of_week: day,
        start_time: start,
        end_time: addHours(start, durationHours),
        capacity: defaultCapacity,
        is_active: true,
        tier_ids: [],
      },
    ]);
  }
  function toggleTier(schedule: RecurringSchedule, tierId: string) {
    const current = schedule.tier_ids ?? [];
    const next = current.includes(tierId)
      ? current.filter((x) => x !== tierId)
      : [...current, tierId];
    update(schedule.id, { tier_ids: next });
  }

  return (
    <div className="grid gap-2">
      {sorted.map((s) => (
        <div key={s.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Día</span>
              <select
                className="h-9 rounded-xl border border-input bg-card px-2 capitalize"
                value={s.day_of_week}
                onChange={(e) => update(s.id, { day_of_week: parseInt(e.target.value, 10) })}
              >
                {DAY_ORDER.map((d) => (
                  <option key={d} value={d} className="capitalize">
                    {dayName(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Hora</span>
              <Input
                type="time"
                className="h-9 w-28"
                value={s.start_time}
                onChange={(e) => update(s.id, { start_time: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Cupo</span>
              <Input
                type="number"
                className="h-9 w-20"
                value={s.capacity}
                onChange={(e) => update(s.id, { capacity: parseInt(e.target.value) || 1 })}
              />
            </label>
            <span className="ml-auto pb-1 text-xs text-muted-foreground">
              termina {s.end_time ?? addHours(s.start_time, durationHours)}
            </span>
            <button
              type="button"
              onClick={() => remove(s.id)}
              aria-label="Quitar horario"
              className="pb-0.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {tiers.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <span className="mb-1 block text-xs text-muted-foreground">Tiers en esta salida</span>
              <div className="flex flex-wrap gap-1.5">
                {tiers.map((t) => {
                  const active = (s.tier_ids?.length ? s.tier_ids : tiers.map((x) => x.id)).includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTier(s, t.id)}
                      className={
                        "rounded-full px-2.5 py-1 text-xs transition " +
                        (active
                          ? "bg-primary/20 text-ink ring-1 ring-primary"
                          : "border border-border text-muted-foreground hover:bg-accent")
                      }
                    >
                      {t.tier_name || "Sin nombre"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Agregar salida:</span>
        {DAY_ORDER.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => add(d)}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs capitalize text-muted-foreground transition hover:bg-accent"
          >
            <Plus className="h-3 w-3" /> {dayName(d).slice(0, 3)}
          </button>
        ))}
      </div>

      {value.length === 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Agrega una o varias salidas por día (ej. sábado 9:00 y 14:00).
        </p>
      )}
    </div>
  );
}
