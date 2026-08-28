import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePublishedExperiences } from "@/hooks/usePublicData";
import { searchExperiences, citiesOf } from "@/ai/discovery";
import { runConciergeTurn, type ConciergeResult } from "@/ai/concierge";
import { isLLMEnabled } from "@/ai/llm";
import { ExperienceCard } from "@/components/tourist/ExperienceCard";
import { TouristHeader, TouristFooter } from "@/components/tourist/TouristChrome";
import { Markdown } from "@/components/ui/Markdown";
import { cn } from "@/lib/utils";
import { Search, Sparkles, MapPin, Loader2, X, ArrowUp } from "lucide-react";

const QUICK = ["Café", "Playa", "Aventura", "Cultura", "Naturaleza", "Menos de $30"];

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
  const [ai, setAi] = useState<{ loading: boolean; result?: ConciergeResult; q: string } | null>(
    null
  );

  const cities = useMemo(() => citiesOf(list).slice(0, 8), [list]);
  const results = useMemo(() => {
    let r = searchExperiences(list, query);
    if (city) r = r.filter((e) => e.city === city);
    return r;
  }, [list, query, city]);

  async function ask() {
    const q = query.trim();
    if (!q || !list.length) return;
    if (!isLLMEnabled) return; // fall back to the live text filter
    setAi({ loading: true, q });
    try {
      const result = await runConciergeTurn(q, list);
      setAi({ loading: false, result, q });
    } catch (e) {
      console.error("Concierge error", e);
      // Never dead-end: show all experiences with a friendly note.
      setAi({
        loading: false,
        q,
        result: {
          reply:
            "Uy, no pude procesar tu búsqueda en este momento 🙈. Mientras tanto, aquí tienes nuestras experiencias disponibles — o intenta de nuevo con otras palabras.",
          matchIds: list.map((e) => e.id),
          people: null,
          date: null,
        },
      });
    }
  }

  const aiExperiences = ai?.result
    ? (ai.result.matchIds
        .map((id) => list.find((e) => e.id === id))
        .filter(Boolean) as typeof list)
    : [];
  const aiParams = ai?.result ? bookingParams(ai.result.people, ai.result.date) : "";

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
          className="mx-auto mt-7 flex max-w-xl items-center gap-2 rounded-full border border-border bg-card py-2 pl-4 pr-2 shadow-sm focus-within:ring-2 focus-within:ring-ring"
        >
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej. café para 3 personas el 29 de agosto"
            className="w-full bg-transparent py-1.5 text-base focus:outline-none"
          />
          {isLLMEnabled && (
            <button
              type="submit"
              disabled={!query.trim() || ai?.loading}
              aria-label="Preguntar al concierge"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-ink transition hover:opacity-90 disabled:opacity-50"
            >
              {ai?.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          )}
        </form>
        {isLLMEnabled && (
          <p className="mt-2 text-xs text-muted-foreground">
            Pregúntale al concierge en tus palabras — filtra por tipo, personas y fecha.
          </p>
        )}

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
