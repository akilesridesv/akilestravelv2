export function normalize(s: string) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
export const INTERESTS: Record<string, string[]> = {
  playa: ["playa", "beach", "surf", "snorkel", "costa"], cafe: ["cafe", "coffee", "cafetal", "barismo"],
  naturaleza: ["naturaleza", "nature", "outdoors", "al aire libre", "bosque", "senderismo"],
  aventura: ["aventura", "adventure", "aventurero"], cultura: ["cultura", "culture", "museo", "historia"],
  scooter: ["scooter", "scooters", "monopatin"], atv: ["atv", "cuatrimoto", "cuatrimotos"],
  gastronomia: ["gastronomia", "gastronomy", "food", "comida", "pupusas"],
  fotografia: ["fotografia", "photography", "fotos"], montana: ["montana", "mountains", "volcan", "hiking"],
  urbano: ["urbano", "urban", "ciudad", "city"],
};
export function contains(text: string, term: string) {
  return (` ${normalize(text).replace(/[^a-z0-9]+/g, " ")} `).includes(` ${normalize(term).replace(/[^a-z0-9]+/g, " ")} `);
}
export function interestMatch(interest: string, text: string) {
  return (INTERESTS[normalize(interest)] ?? [interest]).some((term) => contains(text, term));
}
