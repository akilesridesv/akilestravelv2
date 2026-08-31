// Lightweight intent router for the provider copilot.
// Keyword-based today; the same interface can be backed by an LLM classifier later.

export type Intent =
  | "create_experience"
  | "edit_experience"
  | "manage_calendar"
  | "set_deadline"
  | "manage_tiers"
  | "share_experience"
  | "booking_action"
  | "view_bookings"
  | "view_revenue"
  | "view_experiences"
  | "view_profile"
  | "edit_profile"
  | "set_preferences"
  | "guide"
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

/**
 * @param context the panel currently open on the right (experiences | calendar |
 * bookings | revenue). Used as a tiebreaker so an ambiguous message is resolved
 * in the context of what the provider is looking at.
 */
export function classifyIntent(input: string, context?: string): Intent {
  const t = norm(input);

  // 1. Booking actions (approve / reject a reservation)
  if (/(aprueba|aprobar|acepta|aceptar|rechaza|rechazar|niega|negar|declina|declinar)/.test(t))
    return "booking_action";

  // 1b. Minimum advance-booking time
  if (/anticip/.test(t) || /\bcon\s+\d+\s*(?:dias?|d|horas?|h)\b/.test(t) || /\d+\s*(?:dias?|horas?)\s+antes/.test(t))
    return "set_deadline";

  // 1c. Share an experience (get its booking link)
  if (/(comparte|compartir)/.test(t) || /\b(enlace|link)\b/.test(t)) return "share_experience";

  // 1c-i. Preferences / settings (notifications, approval mode, assistant language)
  if (
    /(preferencia|notificaci|\bavisos?\b|alertas?|auto\s?aprob|aprob\w*\s+autom|reservas?\s+autom|idioma del asistente|resumen diario|silenci)/.test(
      t
    ) ||
    (/(configuracion|ajustes|preferencia)/.test(t) && /(notif|aviso|reserva|idioma|aprob|canal)/.test(t))
  )
    return "set_preferences";

  // 1c-ii. View the provider profile
  if (
    /(mi perfil|ver (mi )?perfil|muestrame (mi )?perfil|perfil (del|de mi|de) (negocio|proveedor)|como se ve mi perfil)/.test(
      t
    )
  )
    return "view_profile";

  // 1c-iii. Edit profile: contact channels, business identity, media, social links
  if (
    /(correo de contacto|correo del negocio|email de contacto|mi (correo|email|telefono|numero|celular|whatsapp)|telefono (del|de) (negocio|contacto)|numero de (contacto|telefono|whatsapp)|\bwhatsapp\b|instagram|facebook|tik\s?tok|sitio web|pagina web|nombre (del|de la|de mi|comercial) (negocio|empresa|marca)?|mi (negocio|empresa) se llama|renombra (el negocio|la empresa)|eslogan|slogan|tagline|\bbio\b|biografia|descripcion del negocio|sobre (nosotros|mi negocio)|logo|portada|idiomas?|hablo|hablamos|ciudad (del|de) (negocio|contacto)|estoy ubicad|operamos en)/.test(
      t
    )
  )
    return "edit_profile";

  // 1d. Manage tiers (add / remove a ticket tier)
  if (/\btiers?\b/.test(t) && /(agrega|agregar|anade|anadir|crea|crear|pon|poner|quita|quitar|elimina|eliminar|borra|borrar|remueve|remover)/.test(t))
    return "manage_tiers";

  // 1e. Strong creation intent: "quiero subir/crear/publicar una experiencia/tour…".
  // Must run BEFORE the edit rule because "subir" is also an edit verb ("sube el
  // precio"); here it's a create because the OBJECT is an offering noun.
  if (
    /(subir|sube|crear|crea|publicar|publica|registrar|registra|ofrecer|ofrezco|dar de alta|agregar una|anadir una|nueva|nuevo)\s+(un|una|el|la|mi|otro|otra|nuev[oa])?\s*(tour|experiencia|actividad|paseo|clase|taller|excursion|paquete|servicio|aventura|cata|degustacion|ruta|caminata)/.test(
      t
    )
  )
    return "create_experience";

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

  // 4b. Guided setup ("¿cómo abro reservas?", "quiero habilitar fechas", "guíame")
  if (
    /(como (abro|habilito|configuro|pongo|empiezo|hago)|ayuda(me)? a (configurar|abrir|habilitar|vender)|guiame|guiar|no se como|por donde empiezo|quiero (abrir|habilitar|recibir|empezar))/.test(
      t
    )
  )
    return "guide";

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

  // 7. Context-aware fallback: resolve against the panel open on the right,
  // so the chat acts on "what the provider is looking at".
  switch (context) {
    case "calendar":
      return "manage_calendar";
    case "bookings":
      return "view_bookings";
    case "revenue":
      return "view_revenue";
    case "experiences":
      return "view_experiences";
  }

  return "unknown";
}
