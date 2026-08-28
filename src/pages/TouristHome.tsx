import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePublishedExperiences } from "@/hooks/usePublicData";
import { searchExperiences, citiesOf } from "@/ai/discovery";
import { ExperienceCard } from "@/components/tourist/ExperienceCard";
import { TouristHeader, TouristFooter } from "@/components/tourist/TouristChrome";
import { cn } from "@/lib/utils";
import { Search, Sparkles, MapPin } from "lucide-react";

const QUICK = ["Café", "Playa", "Aventura", "Cultura", "Naturaleza", "Menos de $30"];

export default function TouristHome() {
  const { data, loading } = usePublishedExperiences();
  const list = data ?? [];
  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string>("");

  const cities = useMemo(() => citiesOf(list).slice(0, 8), [list]);
  const results = useMemo(() => {
    let r = searchExperiences(list, query);
    if (city) r = r.filter((e) => e.city === city);
    return r;
  }, [list, query, city]);

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

        <div className="mx-auto mt-7 flex max-w-xl items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej. algo tranquilo cerca del mar para 2 personas"
            className="w-full bg-transparent py-1.5 text-base focus:outline-none"
          />
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

      {/* Grid */}
      <section className="mx-auto max-w-6xl px-5 pt-6 sm:px-8">
        {loading ? (
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
