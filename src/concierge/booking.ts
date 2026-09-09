import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const positive = z.coerce.number().int().min(1).max(500);
export const BookingContextSchema = z.object({
  date: isoDate.optional(), people: z.number().int().min(1).max(500).optional(), children: z.number().int().min(0).max(499).optional(),
  experienceId: z.string().uuid().optional(), time: clockTime.optional(),
});
export const ConfirmedBookingSchema = BookingContextSchema.extend({ timePreference: z.enum(["morning", "afternoon", "evening"]).optional() });
export type BookingContext = z.infer<typeof BookingContextSchema>;
type BookingProfile = { date?: string; adults?: number; children?: number; timePreference?: string };
export function currentBookingContext(profile: BookingProfile, confirmed?: z.infer<typeof ConfirmedBookingSchema>): BookingContext {
  const count = profile.adults == null ? undefined : profile.adults + (profile.children ?? 0);
  const people = count != null && count <= 500 ? count : undefined;
  const matches = confirmed && confirmed.date === profile.date && confirmed.people === people &&
    (confirmed.children ?? 0) === (profile.children ?? 0) && confirmed.timePreference === profile.timePreference;
  return { date: profile.date, people, children: people != null && (profile.children ?? 0) < people ? profile.children : undefined,
    ...(matches ? { experienceId: confirmed.experienceId, time: confirmed.time } : {}) };
}
export function reservationPath(id: string, context?: BookingContext, legacyPath?: string): string {
  if (context) return bookingLink(id, { ...context, time: context.experienceId === id ? context.time : undefined });
  // Older conversations may have a response-wide booking link; never reuse it for another card.
  if (legacyPath?.startsWith(`/e/${id}?`)) return legacyPath;
  return bookingLink(id, {});
}
export type BookingPrefill = { date?: string; time?: string; people?: number; children?: number; open: boolean };

export function readBookingPrefill(params: URLSearchParams): BookingPrefill {
  const date = isoDate.safeParse(params.get("date"));
  const time = clockTime.safeParse(params.get("time"));
  const people = positive.safeParse(params.get("people"));
  const children = z.coerce.number().int().min(0).max(499).safeParse(params.get("children"));
  return { date: date.success ? date.data : undefined, time: time.success ? time.data : undefined,
    people: people.success ? people.data : undefined,
    children: children.success && people.success && children.data < people.data ? children.data : undefined,
    open: params.get("book") === "1" || date.success || people.success };
}

export function bookingLink(id: string, input: Omit<BookingPrefill, "open">): string {
  z.string().uuid().parse(id);
  const params = new URLSearchParams({ book: "1" });
  if (input.date) params.set("date", isoDate.parse(input.date));
  if (input.time && input.date) params.set("time", clockTime.parse(input.time.slice(0, 5)));
  if (input.people != null) params.set("people", String(positive.parse(input.people)));
  if (input.children != null && input.people != null && input.children < input.people) params.set("children", String(z.number().int().nonnegative().parse(input.children)));
  return `/e/${id}?${params}`;
}

export function conversationalDate(iso: string): string {
  isoDate.parse(iso);
  const parts = new Intl.DateTimeFormat("es-SV", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(new Date(`${iso}T12:00:00Z`));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${get("weekday")} ${get("day")} de ${get("month")} ${get("year")}`;
}
export function conversationalTime(time: string): string {
  clockTime.parse(time.slice(0, 5));
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""} ${hours >= 12 ? "pm" : "am"}`;
}
