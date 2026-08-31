import { useEffect, useState, type ReactNode } from "react";
import type { Experience, ExperienceDraft } from "@/types/domain";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { useApp } from "@/state/store";
import { ImageUploader } from "@/components/provider/ImageUploader";
import { TierManager } from "@/components/provider/TierManager";
import { ItineraryEditor } from "@/components/provider/ItineraryEditor";
import { ScheduleEditor } from "@/components/provider/ScheduleEditor";
import { DateCalendar } from "@/components/provider/DateCalendar";
import { DeadlineControl } from "@/components/provider/DeadlineControl";
import { draftToPatch } from "@/lib/experience";
import { COUNTRIES, departmentsOf } from "@/lib/geo";
import { notify } from "@/state/toast";
import { useDraftImages } from "@/state/draftImages";
import { formatUSD, cn } from "@/lib/utils";
import {
  Check,
  MapPin,
  Clock,
  Users,
  CalendarDays,
  CalendarRange,
  Sparkles,
  X,
  Ticket,
  Timer,
  ChevronDown,
  Plus,
  Backpack,
  ListChecks,
  Ban,
  Globe,
  Tag,
  Route,
} from "lucide-react";

/**
 * The editable listing card. Used in two modes:
 *  - "create": the copilot renders it after extracting a natural-language
 *    description → provider tweaks → publishes (pending_review).
 *  - "edit": opened from the Experiences panel or a chat edit → provider
 *    tweaks → saves changes to an existing experience.
 */
export function ExperienceDraftEditor({
  initial,
  mode = "create",
  experienceId,
  onDone,
  onCancel,
}: {
  initial: ExperienceDraft;
  mode?: "create" | "edit";
  experienceId?: string;
  onDone?: (title: string) => void;
  onCancel?: () => void;
}) {
  const publishDraft = useApp((s) => s.publishDraft);
  const updateExperience = useApp((s) => s.updateExperience);
  const [d, setD] = useState<ExperienceDraft>(initial);
  const [published, setPublished] = useState(false);
  const [showDates, setShowDates] = useState((initial.date_slots ?? []).length > 0);
  const [showItinerary, setShowItinerary] = useState((initial.itinerary ?? []).length > 0);
  const [showDetails, setShowDetails] = useState(() =>
    [initial.highlights, initial.whats_included, initial.whats_not_included, initial.what_to_bring].some(
      (a) => (a ?? []).length > 0
    )
  );

  // Consume images uploaded from the chat composer's "add images" button and
  // append them to this draft (first mounted editor wins — consume is atomic).
  const pendingImages = useDraftImages((s) => s.pending);
  const consumeImages = useDraftImages((s) => s.consume);
  useEffect(() => {
    if (published || pendingImages.length === 0) return;
    const refs = consumeImages();
    if (!refs.length) return;
    setD((prev) => {
      const next = [...prev.image_urls, ...refs];
      return { ...prev, image_urls: next, featured_image: prev.featured_image ?? next[0] };
    });
  }, [pendingImages, published, consumeImages]);

  const set = <K extends keyof ExperienceDraft>(k: K, v: ExperienceDraft[K]) =>
    setD((prev) => ({ ...prev, [k]: v }));

  const isDefault = (k: keyof Experience) => d._sources[k] !== "extracted";

  const isEdit = mode === "edit";

  function save() {
    if (isEdit && experienceId) {
      updateExperience(experienceId, draftToPatch(d));
      notify(`Cambios guardados en “${d.title}”.`);
    } else {
      publishDraft(d);
      notify(`“${d.title}” enviada para revisión.`);
    }
    setPublished(true);
    onDone?.(d.title);
  }

  if (published) {
    return (
      <Card className="animate-fade-in overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-primary/10 p-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-ink">
            <Check className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg">
              {isEdit ? "Cambios guardados" : "¡Publicada para revisión!"}
            </p>
            <p className="text-sm text-muted-foreground">
              {isEdit ? (
                <>Actualicé “{d.title}”.</>
              ) : (
                <>
                  “{d.title}” quedó en <b>pendiente de revisión</b>. La verificamos y en cuanto se
                  apruebe estará visible para turistas.
                </>
              )}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {isEdit ? "Editar experiencia" : "Ficha lista para revisar"}
        </span>
        {onCancel ? (
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">Editá lo que quieras y publicá</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Imágenes de la experiencia</Label>
          <ImageUploader
            value={d.image_urls}
            onChange={(refs) =>
              setD((prev) => ({ ...prev, image_urls: refs, featured_image: refs[0] }))
            }
          />
        </div>

        <div className="sm:col-span-2">
          <Label>Título</Label>
          <Input value={d.title} onChange={(e) => set("title", e.target.value)} />
        </div>

        <div>
          <Label className="inline-flex items-center gap-1">
            Precio por persona {isDefault("price_per_person") && <Dot />}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">$</span>
            <Input
              type="number"
              inputMode="decimal"
              disabled={d.tiers.length > 0}
              value={d.price_per_person || ""}
              onChange={(e) => set("price_per_person", parseFloat(e.target.value) || 0)}
            />
          </div>
          {d.tiers.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Con tiers activos, el precio base se reemplaza por los precios de los tiers.
            </p>
          )}
        </div>

        <div>
          <Label className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> Duración (horas) {isDefault("duration_hours") && <Dot />}
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            value={d.duration_hours || ""}
            onChange={(e) => set("duration_hours", parseFloat(e.target.value) || 0)}
          />
        </div>

        <div>
          <Label className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3" /> País
          </Label>
          <select
            value={d.country ?? ""}
            onChange={(e) => setD((prev) => ({ ...prev, country: e.target.value, department: "" }))}
            className="h-9 w-full rounded-xl border border-input bg-card px-2 text-sm"
          >
            <option value="">Selecciona…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Departamento
          </Label>
          {departmentsOf(d.country).length ? (
            <select
              value={d.department ?? ""}
              onChange={(e) => set("department", e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-card px-2 text-sm"
            >
              <option value="">Selecciona…</option>
              {departmentsOf(d.country).map((dep) => (
                <option key={dep} value={dep}>
                  {dep}
                </option>
              ))}
            </select>
          ) : (
            <Input
              value={d.department ?? ""}
              placeholder="Departamento / estado"
              onChange={(e) => set("department", e.target.value)}
            />
          )}
        </div>

        <div>
          <Label className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Ciudad o zona (opcional)
          </Label>
          <Input
            value={d.city ?? ""}
            placeholder="Ej. El Tunco, Ataco…"
            onChange={(e) => set("city", e.target.value)}
          />
        </div>

        <div>
          <Label className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" /> Cupo (mín – máx) {isDefault("max_capacity") && <Dot />}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={d.min_capacity}
              onChange={(e) => set("min_capacity", parseInt(e.target.value) || 1)}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              value={d.max_capacity}
              onChange={(e) => set("max_capacity", parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <Label>Descripción</Label>
          <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={3} />
        </div>

        <div className="sm:col-span-2">
          <Label className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3" /> Etiquetas (tags)
          </Label>
          <Input
            value={(d.tags ?? []).join(", ")}
            placeholder="aventura, relax, al aire libre, surf, familiar"
            onChange={(e) =>
              set(
                "tags",
                e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
              )
            }
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Separadas por coma. Ayudan a que el concierge de IA encuentre tu experiencia cuando el
            turista busca por gustos (ej. surf, playa, aventura, cultural).
          </p>
          {(d.tags ?? []).length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {d.tags.map((t) => (
                <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-xs">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <Label className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Punto de encuentro
          </Label>
          <Input
            value={d.location_address ?? ""}
            placeholder="Dirección, coordenadas (13.6989,-89.1914) o link de Google Maps"
            onChange={(e) => set("location_address", e.target.value)}
          />
          <div className="mt-2 rounded-xl border border-border bg-secondary/40 p-3 text-[12px] leading-relaxed text-muted-foreground">
            <p className="mb-1.5 inline-flex items-center gap-1 font-medium text-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Cómo marcar el punto exacto en el mapa
            </p>
            <p className="mb-1.5">
              <span className="font-medium text-foreground">Opción A — Coordenadas (más fácil):</span>{" "}
              en Google Maps haz <b>clic derecho</b> sobre el punto exacto → haz clic en las
              coordenadas que aparecen (ej. <b>13.6989, -89.1914</b>) para copiarlas → pégalas aquí.
            </p>
            <p>
              <span className="font-medium text-foreground">Opción B — Enlace completo:</span> abre el
              punto en Google Maps (en computadora) y copia la <b>URL de la barra de direcciones</b> (la
              larga que trae “@13.69,-89.19”), <b>no</b> la de “Compartir”. Pégala aquí.
            </p>
            <p className="mt-1.5">
              También puedes escribir la dirección. Un link corto “maps.app.goo.gl” abre la ubicación,
              pero no la marca dentro del mapa.
            </p>
          </div>
        </div>

        {/* Detalles para el turista (todo el detalle, editable) */}
        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            className="flex w-full items-center gap-1.5 text-left"
          >
            <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Detalles para el turista: highlights, incluye, no incluye, qué llevar
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 text-muted-foreground transition-transform",
                showDetails && "rotate-180"
              )}
            />
          </button>
          {showDetails && (
            <div className="mt-2 grid gap-4 rounded-xl border border-border p-3">
              <ListField
                label="Lo que vivirás (highlights)"
                icon={<Sparkles className="h-3 w-3 text-primary" />}
                value={d.highlights}
                onChange={(v) => set("highlights", v)}
                placeholder="Ej. Vista panorámica de San Salvador"
              />
              <ListField
                label="Incluye"
                icon={<Check className="h-3 w-3 text-emerald-600" />}
                value={d.whats_included}
                onChange={(v) => set("whats_included", v)}
                placeholder="Ej. Scooter, casco y guía"
              />
              <ListField
                label="No incluye"
                icon={<Ban className="h-3 w-3 text-muted-foreground" />}
                value={d.whats_not_included}
                onChange={(v) => set("whats_not_included", v)}
                placeholder="Ej. Alimentos y bebidas"
              />
              <ListField
                label="Qué llevar"
                icon={<Backpack className="h-3 w-3 text-primary" />}
                value={d.what_to_bring}
                onChange={(v) => set("what_to_bring", v)}
                placeholder="Ej. Ropa cómoda, agua y protector solar"
              />
            </div>
          )}
        </div>

        {/* Qué haremos — itinerary timeline */}
        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={() => setShowItinerary((s) => !s)}
            className="flex w-full items-center gap-1.5 text-left"
          >
            <Route className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Qué haremos: itinerario paso a paso (opcional)
            </span>
            {(d.itinerary ?? []).length > 0 && (
              <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[10px] text-teal">
                {(d.itinerary ?? []).length}
              </span>
            )}
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 text-muted-foreground transition-transform",
                showItinerary && "rotate-180"
              )}
            />
          </button>
          {showItinerary && (
            <div className="mt-2 rounded-xl border border-border p-3">
              <ItineraryEditor value={d.itinerary ?? []} onChange={(v) => set("itinerary", v)} />
            </div>
          )}
        </div>

        {/* Tiers */}
        <div className="sm:col-span-2">
          <Label className="inline-flex items-center gap-1">
            <Ticket className="h-3 w-3" /> Tiers (entrada regular, VIP…)
          </Label>
          <TierManager value={d.tiers} onChange={(tiers) => set("tiers", tiers)} />
        </div>

        {/* Schedule — multiple horarios per day */}
        <div className="sm:col-span-2">
          <Label className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> Horarios de salida {isDefault("schedules") && <Dot />}
          </Label>
          <ScheduleEditor
            value={d.schedules}
            onChange={(sch) => set("schedules", sch)}
            tiers={d.tiers}
            durationHours={d.duration_hours}
            defaultCapacity={d.max_capacity}
          />
        </div>

        {/* Specific dates (Airbnb-style month calendar) */}
        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={() => setShowDates((s) => !s)}
            className="flex w-full items-center gap-1.5 text-left"
          >
            <CalendarRange className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Fechas específicas para reservar (opcional)
            </span>
            {(d.date_slots ?? []).length > 0 && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-ink">
                {(d.date_slots ?? []).length}
              </span>
            )}
            <ChevronDown
              className={cn(
                "ml-auto h-4 w-4 text-muted-foreground transition-transform",
                showDates && "rotate-180"
              )}
            />
          </button>
          {showDates && (
            <div className="mt-2 rounded-xl border border-border p-3">
              <DateCalendar experience={d} onChange={(ds) => set("date_slots", ds)} />
            </div>
          )}
        </div>

        {/* Minimum advance booking */}
        <div className="sm:col-span-2">
          <Label className="inline-flex items-center gap-1">
            <Timer className="h-3 w-3" /> Anticipación mínima de reserva
          </Label>
          <DeadlineControl
            hours={d.registration_deadline_hours}
            onChange={(h) => set("registration_deadline_hours", h)}
          />
        </div>

        <div className="sm:col-span-2">
          <Label className="inline-flex items-center gap-1">
            <Ban className="h-3 w-3" /> Política de cancelación
          </Label>
          <Input
            value={d.cancellation_policy ?? ""}
            placeholder="Ej. Cancelación gratuita hasta 24 horas antes"
            onChange={(e) => set("cancellation_policy", e.target.value)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Si lo dejas vacío, mostramos una política estándar según tu anticipación mínima.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row sm:items-center">
        <p className="text-sm text-muted-foreground">
          {formatUSD(d.price_per_person)} / persona{d.city ? ` en ${d.city}` : ""}.
        </p>
        <div className="flex gap-2 sm:ml-auto">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button onClick={save} disabled={!d.title || !d.price_per_person}>
            <Check className="h-4 w-4" /> {isEdit ? "Guardar cambios" : "Publicar para revisión"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Dot() {
  return (
    <span
      title="Valor asumido — revísalo"
      className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
    />
  );
}

/** Editable bullet list: type an item + Enter (or +) to add; remove with ✕. */
function ListField({
  label,
  icon,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  icon: ReactNode;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  function add() {
    const t = text.trim();
    if (!t) return;
    onChange([...value, t]);
    setText("");
  }
  return (
    <div>
      <Label className="inline-flex items-center gap-1">
        {icon} {label}
      </Label>
      <div className="mt-1 flex gap-2">
        <Input
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={add} aria-label="Agregar">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {value.map((it, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1">{it}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, x) => x !== i))}
                aria-label="Quitar"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
