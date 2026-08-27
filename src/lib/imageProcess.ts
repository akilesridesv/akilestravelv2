// Client-side image validation + downscale/compress.
// Goal: images that "load fast" and never bloat storage. We reject > 5 MB
// inputs, then resize the longest side to MAX_DIM and re-encode to JPEG so the
// stored blob is typically a few hundred KB regardless of the original.

export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB hard limit on the ORIGINAL file
const MAX_DIM = 1600; // longest side after resize
const QUALITY = 0.82;

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

export class ImageError extends Error {}

export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith("image/")) {
    throw new ImageError("Ese archivo no es una imagen.");
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new ImageError(`La imagen pesa ${mb} MB. El máximo es 5 MB.`);
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("No se pudo procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (!blob) throw new ImageError("No se pudo comprimir la imagen.");
  return { blob, width, height };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap is fast and off-main-thread where supported.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new ImageError("No se pudo leer la imagen."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
