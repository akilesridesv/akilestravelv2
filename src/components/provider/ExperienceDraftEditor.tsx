import { useEffect, useState, type ReactNode } from "react";
import type { Experience, ExperienceDraft } from "@/types/domain";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
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
import { writeDescription } from "@/ai/writeDescription";
import { COUNTRIES, departmentsOf } from "@/lib/geo";
import { EXPERIENCE_CATEGORIES } from "@/lib/categories";
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
  ChevronLeft,
  ChevronRight,
  Plus,
  Backpack,
  Ban,
  Globe,
  Tag,
  Shapes,
  Route,
  Languages,
  Loader2,
  AlertCircle,
} from "lucide-react";

// Logical order for building an experience — one section per wizard step.
const STEPS = [
  {
    key: "general",
    label: "Descripción general",
    tip: "Fotos, título, descripción y ubicación de la experiencia.",
    ask: "mejora la descripción",
  },
  {
    key: "detalle",
    label: "Detalle",
    tip: "Qué incluye, qué llevar y el punto de encuentro.",
    ask: "agrega que incluye guía y transporte",
  },
  {
    key: "itinerario",
    label: "Itinerario",
    tip: "Las paradas del tour, en orden y con sus horas.",
    ask: "agrega una parada en el mirador a las 10",
  },
  {
    key: "precios",
    label: "Precios y cupos",
    tip: "Precio, cupos y los horarios de salida.",
    ask: "abre los sábados a las 9am cupo 8",
  },
  {
    key: "politicas",
    label: "Políticas y recomendaciones",
    tip: "Anticipación mínima y política de cancelación.",
    ask: "cancelación gratis hasta 24 horas antes",
  },
] as const;

/** Fields that MUST be filled before leaving a given step. */
function requiredMissing(step: number, d: ExperienceDraft): string[] {
  const m: string[] = [];
  if (step === 0) {
    if (!d.title.trim()) m.push("título");
    if (!d.duration_hours) m.push("duración");
    if (!d.country) m.push("país");
  }
  if (step === 3) {
    if (!d.price_per_person && !(d.tiers ?? []).length) m.push("precio o un tier");
    if (!d.max_capacity) m.push("cupo máximo");
  }
  return m;
}

/** Recommended-but-optional fields, surfaced as a friendly checklist at the end. */
function recommendedMissing(d: ExperienceDraft): string[] {
  const m: string[] = [];
  if (!(d.image_urls ?? []).length) m.push("fotos");
  if (!(d.description ?? "").trim()) m.push("descripción");
  if (!(d.whats_included ?? []).length) m.push("qué incluye");
  if (!(d.schedules ?? []).length) m.push("horarios de salida");
  return m;
}

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
  autoOpen = true,
  onDone,
  onCancel,
}: {
  initial: ExperienceDraft;
  mode?: "create" | "edit";
  experienceId?: string;
  /** Edit mode only: open the modal immediately. False for restored chat
   *  history so it doesn't pop the editor on every login. */
  autoOpen?: boolean;
  onDone?: (title: string) => void;
  onCancel?: () => void;
}) {
  const publishDraft = useApp((s) => s.publishDraft);
  const updateExperience = useApp((s) => s.updateExperience);
  const setActiveExperience = useApp((s) => s.setActiveExperience);
  const [d, setD] = useState<ExperienceDraft>(initial);

  // While an existing experience's card is open, mark it as the copilot's active
  // target so chat edits apply to THIS one (and clear it when the card closes).
  useEffect(() => {
    if (mode === "edit" && experienceId) {
      setActiveExperience(experienceId);
      return () => setActiveExperience(null);
    }
  }, [mode, experienceId, setActiveExperience]);
  const [published, setPublished] = useState(false);
  const [step, setStep] = useState(0);
  const [showDates, setShowDates] = useState((initial.date_slots ?? []).length > 0);
  // In edit mode the wizard lives inside a Modal. Own the open state so the X /
  // Escape / backdrop always close it, even when no onCancel prop was passed
  // (e.g. when opened from the chat surface).
  const [modalOpen, setModalOpen] = useState(autoOpen);
  const closeModal = () => {
    setModalOpen(false);
    onCancel?.();
  };

  // When a restored chat edit-block is closed, mark the active experience so
  // chat edits still target it while the wizard is collapsed.
  useEffect(() => {
    if (mode === "edit" && experienceId && modalOpen) setActiveExperience(experienceId);
  }, [modalOpen, mode, experienceId, setActiveExperience]);

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

  // AI-written description: the provider can (re)generate a polished, structured
  // version from the draft's fields and keep the one they like.
  const [writingDesc, setWritingDesc] = useState(false);
  async function regenerateDescription() {
    setWritingDesc(true);
    try {
      const text = await writeDescription(d);
      if (text.trim()) set("description", text.trim());
    } catch {
      notify("No pude redactar la descripción ahora. Intenta de nuevo.", "warning");
    } finally {
      setWritingDesc(false);
    }
  }

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
    const success = (
      <div className="flex items-center gap-3 rounded-2xl bg-primary/10 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-ink">
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
    );
    return isEdit ? (
      <Modal open={modalOpen} onClose={closeModal} title="Listo">
        {success}
        <Button className="mt-4 w-full" onClick={closeModal}>
          Cerrar
        </Button>
      </Modal>
    ) : (
      <Card className="animate-fade-in overflow-hidden">{success}</Card>
    );
  }

  const stepMissing = requiredMissing(step, d);
  const isLast = step === STEPS.length - 1;
  const recMissing = recommendedMissing(d);
  const canSave = !!d.title.trim() && (!!d.price_per_person || (d.tiers ?? []).length > 0);

  const wizard = (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb / stepper */}
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition",
              i === step
                ? "bg-ink text-background"
                : i < step
                ? "bg-primary/15 text-ink hover:bg-primary/25"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                i === step
                  ? "bg-background text-ink"
                  : i < step
                  ? "bg-primary text-ink"
                  : "border border-current"
              )}
            >
              {i < step ? <Check className="h-2.5 w-2.5" /> : i + 1}
            </span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Current step info + how the chat can help here */}
      <div className="rounded-xl bg-secondary/60 p-3">
        <p className="text-xs text-muted-foreground">
          Paso {step + 1} de {STEPS.length}:{" "}
          <b className="text-foreground">{STEPS[step].label}</b>
          {!isLast && <> · Sigue: {STEPS[step + 1].label}</>}
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <span>
            {STEPS[step].tip} También puedes pedirle al chat:{" "}
            <span className="italic">“{STEPS[step].ask}”</span>.
          </span>
        </p>
      </div>

      {/* Step content */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {step === 0 && (
          <>
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
              <Label className="inline-flex items-center gap-1">Título {!d.title.trim() && <Req />}</Label>
              <Input value={d.title} onChange={(e) => set("title", e.target.value)} />
            </div>

            <div className="sm:col-span-2">
              <Label className="inline-flex items-center gap-1">
                <Shapes className="h-3 w-3" /> Categoría {!d.category && <Dot />}
              </Label>
              <select
                value={d.category ?? ""}
                onChange={(e) => set("category", e.target.value)}
                className="h-9 w-full rounded-xl border border-input bg-card px-2 text-sm"
              >
                <option value="">Selecciona una categoría…</option>
                {EXPERIENCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {d.category && !EXPERIENCE_CATEGORIES.includes(d.category as any) && (
                  <option value={d.category}>{d.category}</option>
                )}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Agrupa tu experiencia y ayuda a los turistas (y al concierge de IA) a encontrarte.
              </p>
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
                <Globe className="h-3 w-3" /> País {!d.country && <Req />}
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

            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <Label className="mb-0">Descripción</Label>
                <button
                  type="button"
                  onClick={regenerateDescription}
                  disabled={writingDesc}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium transition hover:bg-accent disabled:opacity-50"
                >
                  {writingDesc ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  )}
                  {writingDesc
                    ? "Redactando…"
                    : d.description.trim()
                    ? "Regenerar con IA"
                    : "Redactar con IA"}
                </button>
              </div>
              <Textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={4} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                La IA la redacta con los datos de la ficha (incluido el itinerario y sus horas). Puedes
                editarla o regenerarla hasta que te guste.
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label className="inline-flex items-center gap-1">
                <Languages className="h-3 w-3" /> Idiomas
              </Label>
              <Input
                value={(d.languages ?? []).join(", ")}
                placeholder="Español, Inglés"
                onChange={(e) =>
                  set(
                    "languages",
                    e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                  )
                }
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Idiomas en que ofreces la experiencia. Se muestran al turista.
              </p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="sm:col-span-2 grid gap-4">
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
                turista busca por gustos.
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
                  coordenadas (ej. <b>13.6989, -89.1914</b>) para copiarlas → pégalas aquí.
                </p>
                <p>
                  <span className="font-medium text-foreground">Opción B — Enlace completo:</span> abre el
                  punto en Google Maps y copia la <b>URL de la barra de direcciones</b> (la larga con
                  “@13.69,-89.19”), <b>no</b> la de “Compartir”. Pégala aquí.
                </p>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="sm:col-span-2">
            <ItineraryEditor value={d.itinerary ?? []} onChange={(v) => set("itinerary", v)} />
          </div>
        )}

        {step === 3 && (
          <>
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
              <Label className="inline-flex items-center gap-1">
                <Ticket className="h-3 w-3" /> Tiers (entrada regular, VIP…)
              </Label>
              <TierManager value={d.tiers} onChange={(tiers) => set("tiers", tiers)} />
            </div>

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
          </>
        )}

        {step === 4 && (
          <>
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
          </>
        )}
      </div>

      {/* Warnings + navigation */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        {!isLast && stepMissing.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Para continuar, completa: {stepMissing.join(", ")}.
          </p>
        )}
        {isLast && recMissing.length > 0 && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Aún puedes agregar (opcional):{" "}
            {recMissing.join(", ")}.
          </p>
        )}
        <div className="flex items-center gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="h-4 w-4" /> Atrás
            </Button>
          )}
          {(isEdit || onCancel) && step === 0 && (
            <Button variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {!isLast ? (
              <Button onClick={() => stepMissing.length === 0 && setStep(step + 1)} disabled={stepMissing.length > 0}>
                Continuar <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={save} disabled={!canSave}>
                <Check className="h-4 w-4" /> {isEdit ? "Guardar cambios" : "Publicar para revisión"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return isEdit ? (
    !modalOpen ? (
      <button
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left text-sm transition hover:bg-accent"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">
          Editor de <b>{d.title || "la experiencia"}</b>
        </span>
        <span className="shrink-0 text-xs font-medium text-ink">Abrir editor</span>
      </button>
    ) : (
      <Modal open={modalOpen} onClose={closeModal} title="Editar experiencia">
        {wizard}
      </Modal>
    )
  ) : (
    <Card className="animate-fade-in overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Nueva experiencia · paso a paso</span>
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label="Cerrar"
            className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="p-4">{wizard}</div>
    </Card>
  );
}

/** Small red "obligatorio" marker next to required fields still empty. */
function Req() {
  return <span className="text-[10px] font-semibold uppercase text-destructive">obligatorio</span>;
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
