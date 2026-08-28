import type { ProviderPreferences, ProviderProfile, ProviderSocial } from "@/types/domain";
import { stripAccents } from "@/ai/nlp";

// ---------------------------------------------------------------------------
// Natural-language → structured patch for the provider profile & preferences.
// The copilot feeds the result to the update_profile / update_preferences tools,
// so a typed command and a future LLM call converge on the same handler.
// ---------------------------------------------------------------------------

/** Trim, strip wrapping quotes and trailing punctuation from a captured value. */
function cleanVal(s: string): string {
  return s
    .trim()
    .replace(/^["“”'']+|["“”''.,;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Value after a keyword phrase, cut before a following "y mi …" clause. */
function afterKeyword(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m) return null;
  let rest = text.slice(m.index! + m[0].length);
  rest = rest.split(/\.\s|\s+y\s+mi\s+|\s+y\s+el\s+|\s*;\s*/i)[0];
  const v = cleanVal(rest);
  return v || null;
}

/** El Salvador-friendly phone extraction (needs a phone/whatsapp keyword nearby). */
function extractPhone(text: string): string | null {
  const m = text.match(/(\+?\d[\d\s().-]{6,}\d)/);
  if (!m) return null;
  const compact = m[1].replace(/[^\d+]/g, "");
  if (compact.replace(/\D/g, "").length < 7) return null;
  const local = compact.replace(/^\+?503/, "");
  if (/^\d{8}$/.test(local)) return `${local.slice(0, 4)}-${local.slice(4)}`;
  return compact;
}

export function parseProfileCommand(text: string): Partial<ProviderProfile> | null {
  const low = stripAccents(text.toLowerCase());
  const patch: Partial<ProviderProfile> = {};
  const social: ProviderSocial = {};

  // --- email ---
  const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (email && /(correo|email|mail|contacto)/.test(low)) patch.contact_email = email[0];

  // --- phone / whatsapp ---
  if (/(whatsapp|wasap|wsp|whats)/.test(low)) {
    const p = extractPhone(text);
    if (p) patch.whatsapp = p;
  }
  if (/(telefono|numero|celular|\btel\b|movil|contacto)/.test(low) && !/whatsapp|wasap|wsp/.test(low)) {
    const p = extractPhone(text);
    if (p) patch.contact_phone = p;
  }

  // --- business name ---
  const name = afterKeyword(
    text,
    /(?:mi (?:negocio|empresa) se llama|nombre (?:del negocio|de la empresa|de mi negocio|comercial)\s*(?:es|sera|:)?|renombra(?:r)?(?: el negocio| la empresa)? a|cambia(?:r)? el nombre(?: del negocio| de la empresa)? a|ll[aá]ma(?:nos|lo)?\s+)/i
  );
  if (name) patch.business_name = name;

  // --- tagline ---
  const tagline = afterKeyword(text, /(?:eslogan|slogan|tagline|frase|lema)\s*(?:es|:|sera)?\s*/i);
  if (tagline) patch.tagline = tagline;

  // --- bio / description ---
  const bio = afterKeyword(
    text,
    /(?:mi (?:bio|biografia|descripcion)|bio|biografia|descripcion del negocio|sobre (?:nosotros|mi negocio|mi)|descri[bp]e(?:me)?(?: el negocio| mi negocio)?)\s*(?:es|:|como)?\s*/i
  );
  if (bio && bio.length > 3) patch.bio = bio;

  // --- city ---
  const city = afterKeyword(
    text,
    /(?:ciudad (?:del negocio|de contacto|es)|estoy? (?:ubicad[oa]s? )?en|ubicad[oa]s? en|operamos en|mi ciudad es|zona (?:es|de operacion))\s*/i
  );
  if (city) patch.city = city;

  // --- languages ---
  const langs = afterKeyword(text, /(?:idiomas?|hablo|hablamos|atiendo en)\s*(?:es|:|son|en)?\s*/i);
  if (langs) {
    const arr = langs
      .split(/,|\sy\s|\/|\|/i)
      .map((x) => cleanVal(x))
      .filter(Boolean)
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
    if (arr.length) patch.languages = arr;
  }

  // --- social ---
  const ig = text.match(/instagram[:\s]+@?([a-z0-9._]+)/i);
  if (ig) social.instagram = ig[1];
  const fb = afterKeyword(text, /facebook[:\s]+/i);
  if (fb) social.facebook = fb;
  const tk = text.match(/tik\s?tok[:\s]+@?([a-z0-9._]+)/i);
  if (tk) social.tiktok = tk[1];
  const web = text.match(/((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
  if (web && /(sitio web|pagina web|web|website|url)/.test(low) && !email) social.website = web[1];
  if (Object.keys(social).length) patch.social = social;

  return Object.keys(patch).length ? patch : null;
}

export function parsePreferenceCommand(text: string): Partial<ProviderPreferences> | null {
  const low = stripAccents(text.toLowerCase()) + " ";
  const patch: Partial<ProviderPreferences> = {};

  const off = /(desactiv|apag|deshabilit|silenci|no\s|quita|ya no|dejar? de)/.test(low);
  const isOn = !off;

  // Booking approval mode
  if (/(aprob\w* autom|reservas autom|auto ?aprob|instant\w*|aprobaci[o]n autom)/.test(low))
    patch.auto_approve_bookings = isOn;
  if (/(aprob\w* manual|revisar (?:las )?reservas|requiere aprob|solicitud de reserva|pedir aprob|request)/.test(low))
    patch.auto_approve_bookings = false;

  // Notifications
  if (/(aviso|avisos|notif\w*|alerta)/.test(low)) {
    if (/cancel/.test(low)) patch.notify_cancellation = isOn;
    else if (/(resumen|diario|digest|del dia)/.test(low)) patch.notify_daily_summary = isOn;
    else if (/(reserva|booking)/.test(low)) patch.notify_new_booking = isOn;
  }
  if (/resumen (diario|del dia)/.test(low)) patch.notify_daily_summary = isOn;

  // Channel
  if (/(correo|email|mail) y whatsapp|whatsapp y (correo|email)|ambos canales|por ambos/.test(low))
    patch.notify_channel = "both";
  else if (/(por|al|via|usa|mandame(?:los)? (?:al|por)|env[ií]a(?:melos)? (?:al|por))?\s*whatsapp/.test(low) && /(aviso|notif|canal|mandame|envia|contact)/.test(low))
    patch.notify_channel = "whatsapp";
  else if (/(por|al|via|usa)\s*(correo|email|mail)/.test(low) && /(aviso|notif|canal)/.test(low))
    patch.notify_channel = "email";

  // Assistant language
  if (/(ingl[e]s|english)/.test(low) && /(idioma|asistente|habla|cambia|pon|en ingl)/.test(low))
    patch.language = "en";
  if (/(espa[n]ol|spanish)/.test(low) && /(idioma|asistente|habla|cambia|pon)/.test(low))
    patch.language = "es";

  return Object.keys(patch).length ? patch : null;
}
