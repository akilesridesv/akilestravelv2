import { useState } from "react";
import { isoDate, todayISO, todayPartsSV, monthName, cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * Minimalist Airbnb-style month picker for the tourist. Only dates with a
 * bookable departure are selectable; the rest are faded. No horizontal scroll —
 * navigate by month, tap a day.
 */
export function BookingCalendar({
  available,
  selected,
  onSelect,
}: {
  available: string[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const set = new Set(available);
  const [cursor, setCursor] = useState(() => {
    const base = selected || available[0] || todayISO();
    const [y, m] = base.split("-").map(Number);
    return { y, m: m - 1 };
  });

  const first = new Date(cursor.y, cursor.m, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(cursor.y, cursor.m, d)));

  const monthKey = (y: number, m: number) => y * 12 + m;
  const curKey = monthKey(cursor.y, cursor.m);
  const tp = todayPartsSV();
  const minKey = monthKey(tp.y, tp.m);
  const last = available[available.length - 1];
  const maxKey = last
    ? monthKey(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 1)
    : curKey;
  const canPrev = curKey > minKey;
  const canNext = curKey < maxKey;

  function shift(delta: number) {
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
          disabled={!canPrev}
          onClick={() => shift(-1)}
          aria-label="Mes anterior"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent disabled:opacity-25"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="font-medium capitalize">
          {monthName(cursor.m)} {cursor.y}
        </span>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => shift(1)}
          aria-label="Mes siguiente"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent disabled:opacity-25"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <span key={`e${i}`} />;
          const avail = set.has(date);
          const isSel = date === selected;
          const dayNum = parseInt(date.slice(8), 10);
          return (
            <button
              key={date}
              type="button"
              disabled={!avail}
              onClick={() => onSelect(date)}
              className={cn(
                "flex aspect-square items-center justify-center rounded-full text-sm transition",
                !avail && "cursor-default text-muted-foreground/25",
                avail && !isSel && "font-medium hover:bg-accent",
                isSel && "bg-ink font-semibold text-background"
              )}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}
