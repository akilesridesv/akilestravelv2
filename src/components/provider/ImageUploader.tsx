import { useRef, useState } from "react";
import { processImageFile, ImageError } from "@/lib/imageProcess";
import { putImage, putImageRemote, deleteImage } from "@/lib/imageStore";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useImageSrc } from "@/hooks/useImageSrc";
import { cn } from "@/lib/utils";
import { ImagePlus, X, ChevronLeft, ChevronRight, Star, Loader2 } from "lucide-react";

/**
 * Upload, reorder, and remove featured images. Images are compressed and stored
 * in IndexedDB; `value` holds only lightweight refs. The first image is the
 * featured one (shown as "Destacada").
 */
export function ImageUploader({
  value,
  onChange,
  max = 8,
}: {
  value: string[];
  onChange: (refs: string[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragIndex = useRef<number | null>(null);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const refs = [...value];
    try {
      for (const file of Array.from(files)) {
        if (refs.length >= max) {
          setError(`Máximo ${max} imágenes.`);
          break;
        }
        try {
          const { blob } = await processImageFile(file);
          refs.push(isSupabaseConfigured ? await putImageRemote(blob) : await putImage(blob));
        } catch (e) {
          setError(e instanceof ImageError ? e.message : "No se pudo subir la imagen.");
        }
      }
      onChange(refs);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeAt(i: number) {
    const ref = value[i];
    onChange(value.filter((_, idx) => idx !== i));
    void deleteImage(ref);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((ref, i) => (
          <Thumb
            key={ref}
            imageRef={ref}
            index={i}
            featured={i === 0}
            onRemove={() => removeAt(i)}
            onLeft={() => move(i, i - 1)}
            onRight={() => move(i, i + 1)}
            canLeft={i > 0}
            canRight={i < value.length - 1}
            onDragStart={() => (dragIndex.current = i)}
            onDrop={() => {
              if (dragIndex.current !== null && dragIndex.current !== i) move(dragIndex.current, i);
              dragIndex.current = null;
            }}
          />
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input text-muted-foreground transition hover:bg-accent disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="text-[11px]">{busy ? "Subiendo…" : "Agregar"}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Hasta {max} imágenes · máx 5 MB c/u · arrastra para reordenar · la primera es la destacada
      </p>
    </div>
  );
}

function Thumb({
  imageRef,
  index,
  featured,
  onRemove,
  onLeft,
  onRight,
  canLeft,
  canRight,
  onDragStart,
  onDrop,
}: {
  imageRef: string;
  index: number;
  featured: boolean;
  onRemove: () => void;
  onLeft: () => void;
  onRight: () => void;
  canLeft: boolean;
  canRight: boolean;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const src = useImageSrc(imageRef);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
    >
      {src && <img src={src} alt={`Imagen ${index + 1}`} className="h-full w-full object-cover" />}

      {featured && (
        <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-ink">
          <Star className="h-3 w-3" /> Destacada
        </span>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="Quitar imagen"
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          onClick={onLeft}
          disabled={!canLeft}
          aria-label="Mover antes"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRight}
          disabled={!canRight}
          aria-label="Mover después"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
