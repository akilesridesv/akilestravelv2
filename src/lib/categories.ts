// Curated list of the most common experience categories for El Salvador travel.
// Providers pick one when creating/editing an experience; tourists browse by it.
// Keep it broad but not endless — these seed the category filter and the
// AI-generated "cartelera" rows on the tourist home.
export const EXPERIENCE_CATEGORIES = [
  "Aventura y adrenalina",
  "Playa y surf",
  "Naturaleza y ecoturismo",
  "Volcanes y senderismo",
  "Cultura e historia",
  "Pueblos mágicos",
  "Gastronomía",
  "Café y fincas",
  "City tour",
  "Bienestar y relax",
  "Deportes acuáticos",
  "Vida nocturna",
  "Fotografía y paisajes",
  "En familia",
  "Arte y artesanías",
  "Tours privados / VIP",
] as const;

export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number];
