// Lightweight intent router for the provider copilot.
// Maps a natural-language message to one of the copilot's capabilities.
// Keyword-based today; the same interface can be backed by an LLM classifier later.

export type Intent =
  | "create_experience"
  | "view_bookings"
  | "view_revenue"
  | "view_experiences"
  | "manage_calendar"
  | "help"
  | "unknown";

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function classifyIntent(input: string): Intent {
  const t = norm(input);

  if (/(reserva|reservas|booking|clientes esta semana|quien viene)/.test(t))
    return "view_bookings";
  if (/(ingreso|ingresos|ventas|cuanto|como va mi mes|revenue|gane|ganado|factur)/.test(t))
    return "view_revenue";
  if (/(mis experiencias|mis listados|que tengo publicado|mis tours)/.test(t))
    return "view_experiences";
  if (/(calendario|disponibilidad|bloquea|abre|salidas|cupo el)/.test(t))
    return "manage_calendar";
  if (/(ayuda|que puedes hacer|help|como funciona|opciones)/.test(t))
    return "help";

  // Creation is the default when the message describes an offering.
  if (
    /(tour|experiencia|clase|taller|paseo|excursion|aventura|ofrezco|vendo|tengo un|hago|guio|guiado)/.test(t) ||
    /\$\s*\d/.test(input) ||
    /\d+\s*(hora|persona|dolar)/.test(t)
  )
    return "create_experience";

  return "unknown";
}
