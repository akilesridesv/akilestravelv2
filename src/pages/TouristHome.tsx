import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { usePublishedExperiences } from "@/hooks/usePublicData";
import { searchExperiences, citiesOf } from "@/ai/discovery";
import { runConciergeTurn, type ConciergeResult } from "@/ai/concierge";
import { isLLMEnabled } from "@/ai/llm";
import { bookableDepartures, bookableDates } from "@/lib/availability";
import { ExperienceCard } from "@/components/tourist/ExperienceCard";
import { TouristHeader, TouristFooter } from "@/components/tourist/TouristChrome";
import { Markdown } from "@/components/ui/Markdown";
import { cn } from "@/lib/utils";
import {
  Search,
  Sparkles,
  MapPin,
  Loader2,
  X,
  ArrowUp,
  SlidersHorizontal,
  CalendarDays,
  Users,
  Plus,
  Mic,
  BarChart3,
  Cpu,
} from "lucide-react";

const QUICK = ["Café", "Playa", "Aventura", "Cultura", "Naturaleza", "Menos de $30"];

// Popular destinations offered in the place filter even if we don't have an
// experience there yet (so the concierge can suggest the closest alternative).
const POPULAR_PLACES = [
  "San Salvador",
  "La Libertad",
  "El Tunco",
  "El Zonte",
  "Santa Ana",
  "Ataco",
  "Juayúa",
  "Suchitoto",
  "Sonsonate",
  "San Miguel",
  "La Unión",
];

interface Filters {
  place: string;
  date: string;
  people: string;
}

/** Query string that pre-fills the booking sheet from a concierge search. */
function bookingParams(people: number | null, date: string | null): string {
  const p = new URLSearchParams();
  if (people) p.set("people", String(people));
  if (date) p.set("date", date);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default function TouristHome() {
  const { data, loading } = usePublishedExperiences();
  const list = data ?? [];
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string>("");
  const [filters, setFilters] = useState<Filters>({ place: "", date: "", people: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [ai, setAi] = useState<{ loading: boolean; result?: ConciergeResult; q: string } | null>(
    null
  );
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the search box so the whole query is readable.
  useEffect(() => {
    const el = taRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 128) + "px";
    }
  }, [query]);

  const cities = useMemo(() => citiesOf(list).slice(0, 8), [list]);
  const places = useMemo(() => {
    const fromExp = list.flatMap((e) => [e.city, e.department].filter(Boolean) as string[]);
    return [...new Set([...fromExp, ...POPULAR_PLACES])];
  }, [list]);
  const hasFilters = !!(filters.place || filters.date || filters.people);

  const results = useMemo(() => {
    let r = searchExperiences(list, query);
    if (city) r = r.filter((e) => e.city === city);
    return r;
  }, [list, query, city]);

  function buildQuery(): string {
    const parts = [query.trim()];
    if (filters.place) parts.push(`en ${filters.place}`);
    if (filters.date) parts.push(`el ${filters.date}`);
    if (filters.people) parts.push(`para ${filters.people} personas`);
    return parts.filter(Boolean).join(" ").trim();
  }

  // Instant, free fallback: fuzzy text + the structured filters (no LLM call).
  function clientFilter() {
    let r = searchExperiences(list, query);
    if (filters.place) {
      const p = filters.place.toLowerCase();
      r = r.filter((e) =>
        `${e.city ?? ""} ${e.department ?? ""} ${e.area ?? ""} ${e.country ?? ""}`
          .toLowerCase()
          .includes(p)
      );
    }
    if (filters.people) {
      const n = parseInt(filters.people, 10);
      if (n) r = r.filter((e) => e.max_capacity >= n);
    }
    if (filters.date) r = r.filter((e) => bookableDates(bookableDepartures(e)).includes(filters.date));
    return r;
  }

  async function ask() {
    const q = buildQuery();
    if (!q || !list.length) return;
    setAi({ loading: true, q });

    if (isLLMEnabled) {
      try {
        const result = await runConciergeTurn(q, list);
        const ids = result.matchIds.length ? result.matchIds : clientFilter().map((e) => e.id);
        setAi({ loading: false, q, result: { ...result, matchIds: ids } });
        return;
      } catch (e) {
        console.error("Concierge error", e);
      }
    }

    // Fell through (LLM off or slow): show relevant results instantly, never a dead end.
    const fc = clientFilter();
    setAi({
      loading: false,
      q,
      result: {
        reply: fc.length
          ? "Esto es lo más parecido a lo que buscas. ¿Quieres afinar por zona, fecha o número de personas?"
          : "No encontré algo exacto para tu búsqueda, pero aquí tienes nuestras experiencias disponibles — ajusta los filtros o intenta con otras palabras.",
        matchIds: (fc.length ? fc : list).map((e) => e.id),
        people: filters.people ? parseInt(filters.people, 10) : null,
        date: filters.date || null,
      },
    });
  }

  const aiExperiences = ai?.result
    ? (ai.result.matchIds
        .map((id) => list.find((e) => e.id === id))
        .filter(Boolean) as typeof list)
    : [];
  const aiParams = ai?.result ? bookingParams(ai.result.people, ai.result.date) : "";

  // Composer "+" menu — Claude-style. Add future tools here (voice, models,
  // search types, usage…); `soon: true` renders them as projected placeholders.
  const plusMenu: {
    key: string;
    icon: React.ElementType;
    label: string;
    onClick?: () => void;
    soon?: boolean;
  }[] = [
    {
      key: "filters",
      icon: SlidersHorizontal,
      label: "Filtros de búsqueda",
      onClick: () => {
        setShowFilters(true);
        setPlusOpen(false);
      },
    },
    { key: "voice", icon: Mic, label: "Búsqueda por voz", soon: true },
    { key: "model", icon: Cpu, label: "Modelo de búsqueda", soon: true },
    { key: "type", icon: Sparkles, label: "Tipo de búsqueda", soon: true },
    { key: "usage", icon: BarChart3, label: "Mis búsquedas", soon: true },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <TouristHeader />

      {/* Hero + concierge */}
      <section className="mx-auto max-w-3xl px-5 pt-14 pb-8 text-center sm:px-8 sm:pt-20">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Descubre con tu concierge de IA
        </p>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
          Vive El Salvador.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
          Experiencias curadas y verificadas. Dinos qué buscas y reserva en minutos.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="mx-auto mt-7 w-full max-w-xl rounded-3xl border border-border bg-card p-2 text-left shadow-sm focus-within:ring-2 focus-within:ring-ring"
        >
          <div className="flex items-start gap-2 px-2 pt-1">
            <Search className="mt-2 h-5 w-5 shrink-0 text-muted-foreground" />
            <textarea
              ref={taRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
              rows={1}
              placeholder="Ej. tour en lancha en El Tunco para 4 personas"
              className="max-h-32 w-full resize-none bg-transparent py-1.5 text-base leading-relaxed focus:outline-none"
            />
          </div>

          {/* Action row: + menu (extensible) · active filters · send */}
          <div className="mt-1 flex items-center gap-2 px-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPlusOpen((o) => !o)}
                aria-label="Más opciones"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border transition",
                  plusOpen
                    ? "border-ink bg-ink text-background"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <Plus className="h-5 w-5" />
              </button>
              {plusOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setPlusOpen(false)} />
                  <div className="absolute bottom-full left-0 z-30 mb-2 w-60 rounded-2xl border border-border bg-card p-1.5 shadow-xl">
                    {plusMenu.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        disabled={item.soon}
                        onClick={item.onClick}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition",
                          item.soon ? "cursor-default opacity-55" : "hover:bg-accent"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1">{item.label}</span>
                        {item.soon && (
                          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            Pronto
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={() => setShowFilters((s) => !s)}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs text-ink"
              >
                <SlidersHorizontal className="h-3 w-3" /> Filtros activos
              </button>
            )}

            <span className="flex-1" />

            <button
              type="submit"
              disabled={ai?.loading}
              aria-label="Buscar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-ink transition hover:opacity-90 disabled:opacity-50"
            >
              {ai?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </form>

        {/* Filters panel (opened from the + menu) */}
        <div className="mx-auto mt-3 flex max-w-xl flex-col items-center gap-3">
          {showFilters && (
            <div className="grid w-full grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-3 text-left sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Lugar
                </span>
                <select
                  value={filters.place}
                  onChange={(e) => setFilters((f) => ({ ...f, place: e.target.value }))}
                  className="h-9 w-full rounded-xl border border-input bg-card px-2 text-sm"
                >
                  <option value="">Cualquier lugar</option>
                  {places.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3 w-3" /> Fecha
                </span>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))}
                  className="h-9 w-full rounded-xl border border-input bg-card px-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" /> Personas
                </span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={filters.people}
                  onChange={(e) => setFilters((f) => ({ ...f, people: e.target.value }))}
                  placeholder="¿Cuántos?"
                  className="h-9 w-full rounded-xl border border-input bg-card px-2 text-sm"
                />
              </label>
              <div className="flex items-center gap-3 sm:col-span-3">
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => setFilters({ place: "", date: "", people: "" })}
                    className="text-xs text-muted-foreground underline underline-offset-2"
                  >
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  onClick={ask}
                  className="ml-auto rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-ink transition hover:opacity-90"
                >
                  Buscar
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Pregúntale al concierge en tus palabras — o toca <b>+</b> para filtros y más.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => setQuery(q === "Menos de $30" ? "menos de 30" : q)}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent"
            >
              {q}
            </button>
          ))}
        </div>
      </section>

      {/* City filter */}
      {cities.length > 0 && (
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            <Chip active={!city} onClick={() => setCity("")}>
              Todas
            </Chip>
            {cities.map((c) => (
              <Chip key={c} active={city === c} onClick={() => setCity(c)}>
                <MapPin className="h-3.5 w-3.5" /> {c}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Grid / concierge results */}
      <section className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        {ai?.loading ? (
          <ConciergeLoading q={ai.q} />
        ) : ai?.result ? (
          <ConciergeResults
            result={ai.result}
            experiences={aiExperiences}
            params={aiParams}
            onClear={() => {
              setAi(null);
              setQuery("");
            }}
          />
        ) : loading ? (
          <SkeletonGrid />
        ) : list.length === 0 ? (
          <Empty />
        ) : results.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            No encontramos experiencias para “{query || city}”. Prueba con otra búsqueda.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {results.length} experiencia{results.length === 1 ? "" : "s"}
              {city ? ` en ${city}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {results.map((e) => (
                <ExperienceCard key={e.id} e={e} />
              ))}
            </div>
          </>
        )}
      </section>

      <TouristFooter />
    </div>
  );
}

function ConciergeLoading({ q }: { q: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Loader2 className="mb-3 h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        Buscando las mejores experiencias para “{q}”…
      </p>
    </div>
  );
}

function ConciergeResults({
  result,
  experiences,
  params,
  onClear,
}: {
  result: ConciergeResult;
  experiences: import("@/data/repo").PublicExperience[];
  params: string;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="mb-6 flex items-start gap-3 rounded-3xl border border-border bg-secondary/40 p-4 sm:p-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-ink">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 text-[15px] leading-relaxed">
          <Markdown text={result.reply} />
        </div>
        <button
          onClick={onClear}
          aria-label="Ver todas"
          className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {experiences.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {experiences.map((e) => (
              <ExperienceCard key={e.id} e={e} params={params} />
            ))}
          </div>
          <button
            onClick={onClear}
            className="mx-auto mt-8 block text-sm text-muted-foreground underline underline-offset-4 transition hover:text-foreground"
          >
            Ver todas las experiencias
          </button>
        </>
      ) : (
        <button
          onClick={onClear}
          className="mx-auto block rounded-full border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-accent"
        >
          Ver todas las experiencias
        </button>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm transition",
        active ? "border-ink bg-ink text-background" : "border-border text-muted-foreground hover:bg-accent"
      )}
    >
      {children}
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-[4/5] rounded-3xl bg-muted" />
          <div className="mt-3 h-4 w-3/4 rounded bg-muted" />
          <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border px-6 py-20 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-ink">
        <Sparkles className="h-6 w-6" />
      </div>
      <p className="font-display text-xl">Pronto habrá experiencias aquí</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Estamos curando las primeras experiencias verificadas de El Salvador.
      </p>
      <Link
        to="/vender"
        className="mt-5 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
      >
        Publica tu experiencia
      </Link>
    </div>
  );
}
