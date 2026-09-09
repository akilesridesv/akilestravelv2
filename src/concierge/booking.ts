import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const positive = z.coerce.number().int().min(1).max(500);
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
