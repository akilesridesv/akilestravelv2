import { notify } from "@/state/toast";

export interface ShareConfig {
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  people?: number;
}

/** Build the public link to an experience, embedding the sharer's config so the
 *  recipient opens it prefilled (date/time/people). Omits empty values. */
export function experienceShareUrl(id: string, cfg?: ShareConfig): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const p = new URLSearchParams();
  if (cfg?.date) p.set("date", cfg.date);
  if (cfg?.time) p.set("time", cfg.time);
  if (cfg?.people) p.set("people", String(cfg.people));
  const qs = p.toString();
  return `${origin}/e/${id}${qs ? `?${qs}` : ""}`;
}

/** Share an experience via the native share sheet, or copy the link. */
export async function shareExperience(id: string, title: string, cfg?: ShareConfig): Promise<void> {
  const url = experienceShareUrl(id, cfg);
  try {
    if (navigator.share) {
      await navigator.share({ title, text: title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    notify("Enlace copiado al portapapeles.");
  } catch {
    /* user cancelled the share sheet */
  }
}
