import { useRef, useState } from "react";
import type { ItineraryStop } from "@/types/domain";
import { Input, Textarea, Label } from "@/components/ui/input";
import { processImageFile, ImageError } from "@/lib/imageProcess";
import { putImage, putImageRemote, deleteImage } from "@/lib/imageStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useImageSrc } from "@/hooks/useImageSrc";
import { notify } from "@/state/toast";
import { ImagePlus, X, ChevronUp, ChevronDown, Plus, Clock, Loader2, MapPin } from "lucide-react";

function genId(): string {
  return (crypto as any)?.randomUUID?.() ?? `stop_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Editor for the "Qué haremos" itinerary. The provider adds ordered stops with a
 * title, subtitle, time interval, short detail and an image. Tourists see these
 * as a horizontal timeline on the experience detail page.
 */
export function ItineraryEditor({
  value,
  onChange,
}: {
  value: ItineraryStop[];
  onChange: (stops: ItineraryStop[]) => void;
}) {
  const stops = value ?? [];

  const patch = (i: number, p: Partial<ItineraryStop>) =>
    onChange(stops.map((s, idx) => (idx === i ? { ...s, ...p } : s)));

  const add = () =>
    onChange([...stops, { id: genId(), title: "", subtitle: "", time_range: "", detail: "" }]);

  const remove = (i: number) => {
    const ref = stops[i].image_url;
    onChange(stops.filter((_, idx) => idx !== i));
    if (ref) void deleteImage(ref);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= stops.length) return;
    const next = [...stops];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="grid gap-3">
      {stops.map((s, i) => (
        <div key={s.id} className="rounded-xl border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal/15 text-xs font-semibold text-teal">
              {i + 1}
            </span>
            <span className="text-xs font-medium text-muted-foreground">Parada {i + 1}</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label="Subir"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-accent disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === stops.length - 1}
                aria-label="Bajar"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-accent disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Quitar parada"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
            <StopImage
              imageRef={s.image_url}
              onChange={(ref) => patch(i, { image_url: ref })}
            />
            <div className="grid gap-2">
              <Input
                value={s.title}
                onChange={(e) => patch(i, { title: e.target.value })}
                placeholder="Título · Ej. Parque Bicentenario"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={s.subtitle ?? ""}
                  onChange={(e) => patch(i, { subtitle: e.target.value })}
                  placeholder="Subtítulo · Ej. Primera parada"
                />
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={s.time_range ?? ""}
                    onChange={(e) => patch(i, { time_range: e.target.value })}
                    placeholder="9:00 - 9:30"
                    className="pl-8"
                  />
                </div>
              </div>
              <Textarea
                value={s.detail ?? ""}
                onChange={(e) => patch(i, { detail: e.target.value })}
                placeholder="Detalle breve · Ej. Recorrido por los senderos y foto grupal"
                rows={2}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-input py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-accent"
      >
        <Plus className="h-4 w-4" /> Agregar parada
      </button>
      {stops.length === 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" /> Explica al turista cómo se desarrolla la actividad, parada por parada.
        </p>
      )}
    </div>
  );
}

/** Single-image uploader for one itinerary stop. */
function StopImage({
  imageRef,
  onChange,
}: {
  imageRef?: string;
  onChange: (ref?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const src = useImageSrc(imageRef);

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { blob } = await processImageFile(file);
      const ref = isSupabaseConfigured ? await putImageRemote(blob) : await putImage(blob);
      if (imageRef) void deleteImage(imageRef);
      onChange(ref);
    } catch (e) {
      notify(e instanceof ImageError ? e.message : "No se pudo subir la imagen.", "warning");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <Label className="sm:hidden">Imagen</Label>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted sm:w-28">
        {src ? (
          <>
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => {
                if (imageRef) void deleteImage(imageRef);
                onChange(undefined);
              }}
              aria-label="Quitar imagen"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground transition hover:bg-accent disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="text-[10px]">{busy ? "Subiendo…" : "Imagen"}</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
    </div>
  );
}
