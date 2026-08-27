// Lightweight intent router for the provider copilot.
// Keyword-based today; the same interface can be backed by an LLM classifier later.

export type Intent =
  | "create_experience"
  | "edit_experience"
  | "manage_calendar"
  | "booking_action"
  | "view_bookings"
  | "view_revenue"
  | "view_experiences"
  | "help"
  | "unknown";

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const OFFERING = /(tour|experiencia|clase|taller|paseo|excursion|aventura|caminata|ruta|cata|degustacion)/;
const HAS_PRICE = (raw: string, t: string) => /\$\s*\d/.test(raw) || /\d+\s*(?:dolares|usd|por persona)/.test(t);
const HAS_DURATION = (t: string) => /\d+\s*(?:hora|horas|hrs?|minutos?)\b/.test(t);
const EDIT_VERB = /(edita|editar|modifica|modificar|cambia|cambiar|actualiza|actualizar|renombra|corrige|corregir|sube|subir|baja|bajar|ajusta|ajustar|pon|poner)/;
const CAL_VERB = /(abre|abrir|bloquea|bloquear|cierra|cerrar|habilita|habilitar|deshabilita|activa|activar|desactiva|desactivar|disponibilidad|calendario|salidas?)/;
const DAY = /(sabado|domingo|lunes|martes|miercoles|jueves|viernes|fin de semana|fines de semana|entre semana)/;

export function classifyIntent(input: string): Intent {
  const t = norm(input);

  // 1. Booking actions (approve / reject a reservation)
  if (/(aprueba|aprobar|acepta|aceptar|rechaza|rechazar|niega|negar|declina|declinar)/.test(t))
    return "booking_action";

  // 2. Edit an existing experience (edit verb + a field noun, but not a calendar field)
  if (
    EDIT_VERB.test(t) &&
    /(precio|costo|vale|cobra|cupo|maximo|nombre|titulo|duracion|dura|experiencia|tour|listado)/.test(t) &&
    !/\bhora\b/.test(t)
  )
    return "edit_experience";

  // 3. Strong creation: describes an offering with a price or duration
  if (OFFERING.test(t) && (HAS_PRICE(input, t) || HAS_DURATION(t))) return "create_experience";

  // 4. Calendar management: an explicit calendar verb, or day names paired with cupo/hora
  if (CAL_VERB.test(t) || (DAY.test(t) && /(cupo|hora|capacidad)/.test(t))) return "manage_calendar";

  // 5. Read-only views
  if (/(reserva|reservas|clientes esta semana|quien viene)/.test(t)) return "view_bookings";
  if (/(ingreso|ingresos|ventas|cuanto|como va mi mes|revenue|gane|ganado|factur)/.test(t))
    return "view_revenue";
  if (/(mis experiencias|mis listados|que tengo publicado|mis tours)/.test(t))
    return "view_experiences";
  if (/(ayuda|que puedes hacer|help|como funciona|opciones)/.test(t)) return "help";

  // 6. Fallback creation when it still looks like an offering
  if (OFFERING.test(t) || HAS_PRICE(input, t) || /(ofrezco|vendo|tengo un|hago|guio|guiado)/.test(t))
    return "create_experience";

  return "unknown";
}
