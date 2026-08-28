import { useState } from "react";
import type { Experience, ExperienceDraft } from "@/types/domain";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { useApp } from "@/state/store";
import { ImageUploader } from "@/components/provider/ImageUploader";
import { TierManager } from "@/components/provider/TierManager";
import { ScheduleEditor } from "@/components/provider/ScheduleEditor";
import { DateCalendar } from "@/components/provider/DateCalendar";
import { DeadlineControl } from "@/components/provider/DeadlineControl";
import { draftToPatch } from "@/lib/experience";
import { notify } from "@/state/toast";
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
            <MapPin className="h-3 w-3" /> Ciudad / zona {isDefault("city") && <Dot />}
          </Label>
          <Input
            value={d.city ?? ""}
            placeholder="Ej. Ataco"
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
