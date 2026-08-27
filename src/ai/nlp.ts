// Shared Spanish NLP helpers used by both extraction (create) and edits.

export const DAY_MAP: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

export const DAY_ABBR = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Parse a clock token → "HH:MM". Requires am/pm or a 24h HH:MM (so "3 horas" is ignored). */
export function parseTimeToken(text: string): string | null {
  const meridiem = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i);
  if (meridiem) {
    let h = parseInt(meridiem[1], 10);
    const min = meridiem[2] ? parseInt(meridiem[2], 10) : 0;
    const mer = meridiem[3].replace(/\./g, "").toLowerCase();
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    if (h <= 23 && min <= 59) return fmt(h, min);
  }
  const h24 = text.match(/\b(?:a\s+las\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) return fmt(parseInt(h24[1], 10), parseInt(h24[2], 10));
  return null;
}

function fmt(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + Math.round(hours * 60)) % (24 * 60);
  return fmt(Math.floor(total / 60), total % 60);
}

/** Detect days of the week from free text, incl. ranges like "fin de semana"/"entre semana". */
export function parseDaysFromText(text: string): number[] {
  const low = stripAccents(text.toLowerCase());
  const days = new Set<number>();
  for (const [name, dow] of Object.entries(DAY_MAP)) {
    if (new RegExp(`\\b${name}s?\\b`).test(low)) days.add(dow);
  }
  if (/todos los dias|diario|diaria|a diario/.test(low)) [0, 1, 2, 3, 4, 5, 6].forEach((d) => days.add(d));
  if (/fin(es)? de semana/.test(low)) [6, 0].forEach((d) => days.add(d));
  if (/entre semana|dias habiles|entresemana/.test(low)) [1, 2, 3, 4, 5].forEach((d) => days.add(d));
  return [...days].sort((a, b) => a - b);
}

/** First money amount in the text, e.g. "$35", "35 dólares", "precio 40". */
export function parseMoney(text: string): number | null {
  const low = stripAccents(text.toLowerCase());
  const m =
    low.match(/\$\s*(\d+(?:[.,]\d+)?)/) ||
    low.match(/(\d+(?:[.,]\d+)?)\s*(?:usd|dolares|por persona)/) ||
    low.match(/precio\s*(?:de\s*|a\s*)?(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}
