import { ExperienceImage } from "@/components/provider/ExperienceImage";
import { Logo } from "@/components/ui/Logo";
import { notify } from "@/state/toast";
import { formatUSD, parseISODate, dayName, monthName, cn } from "@/lib/utils";
import { Share2, MapPin, MessageCircle, Mail, FileDown } from "lucide-react";

export interface TicketData {
  code: string;
  confirmed: boolean;
  title: string;
  coverImage?: string; // experience image ref (optional)
  date: string; // ISO yyyy-mm-dd
  time: string;
  peopleLabel: string; // "2 adultos · 1 niño" or "2 personas"
  holderName?: string;
  meetingPoint?: string; // location_address (text, coords or maps link)
  tierName?: string;
  total?: number;
  whatsapp?: string;
  contactEmail?: string;
}

function fullDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = parseISODate(iso);
  const dn = dayName(d.getDay());
  return `${dn.charAt(0).toUpperCase()}${dn.slice(1)} ${d.getDate()} de ${monthName(d.getMonth())}`;
}

/** Deterministic decorative barcode derived from the confirmation code. */
function Barcode({ code }: { code: string }) {
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
  const bars: { w: number; on: boolean }[] = [];
  for (let i = 0; i < 52; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    bars.push({ w: 1 + ((seed >> 3) % 3), on: (seed >> 6) % 3 !== 0 });
  }
  return (
    <div className="flex h-12 items-stretch gap-[2px]" aria-hidden>
      {bars.map((b, i) => (
        <span key={i} style={{ width: `${b.w * 2}px` }} className={b.on ? "bg-ink" : "bg-transparent"} />
      ))}
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

/** Build the ticket as a PDF blob (voyage-style boarding-pass layout). */
async function buildTicketPdf(d: TicketData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const W = 86;
  const H = 150;
  const M = 8;
  const INK: [number, number, number] = [0x23, 0x25, 0x38];
  const TEAL: [number, number, number] = [0x1b, 0xa1, 0xa9];
  const GRAY: [number, number, number] = [0x89, 0x99, 0x9c];
  const YELLOW: [number, number, number] = [0xfd, 0xbe, 0x39];

  const doc = new jsPDF({ unit: "mm", format: [W, H] });

  // Header band
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 18, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text("akiles", M, 11.5);
  const brandW = doc.getTextWidth("akiles");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...YELLOW);
  doc.text("travel", M + brandW + 1.5, 11.5);
  const status = d.confirmed ? "CONFIRMADO" : "PENDIENTE";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...(d.confirmed ? YELLOW : GRAY));
  doc.text(status, W - M - doc.getTextWidth(status), 11.5);

  // Title
  let y = 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TEAL);
  const titleLines = doc.splitTextToSize(d.title, W - 2 * M) as string[];
  doc.text(titleLines, M, y);
  y += titleLines.length * 5.5 + 4;

  const field = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(value, W / 2 - M - 2) as string[], x, yy + 4.5);
  };
  const colL = M;
  const colR = W / 2 + 2;
  field("Fecha", fullDate(d.date), colL, y);
  field("Hora", d.time, colR, y);
  y += 14;
  field("Titular", d.holderName || "—", colL, y);
  field("Pasajeros", d.peopleLabel, colR, y);
  y += 14;
  if (d.meetingPoint && !/^(https?:\/\/|www\.)/i.test(d.meetingPoint.trim())) {
    field("Punto de encuentro", d.meetingPoint, colL, y);
    y += 14;
  }
  if (d.total != null) {
    field("Precio", formatUSD(d.total), colL, y);
    y += 14;
  }

  // Dashed divider
  doc.setDrawColor(...GRAY);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(M, y, W - M, y);
  doc.setLineDashPattern([], 0);
  y += 8;

  // Barcode
  let seed = 0;
  for (let i = 0; i < d.code.length; i++) seed = (seed * 31 + d.code.charCodeAt(i)) >>> 0;
  const barTop = y;
  const barH = 13;
  let bx = M;
  doc.setFillColor(...INK);
  while (bx < W - M) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const w = (1 + ((seed >> 3) % 3)) * 0.55;
    if ((seed >> 6) % 3 !== 0) doc.rect(bx, barTop, w, barH, "F");
    bx += w + 0.55;
  }
  y = barTop + barH + 6;

  const reg = "NÚMERO DE REGISTRO";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...GRAY);
  doc.text(reg, W / 2 - doc.getTextWidth(reg) / 2, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text(d.code, W / 2 - doc.getTextWidth(d.code) / 2, y + 6);

  return doc.output("blob");
}

/** Share the ticket as a PDF file (native share sheet), or download it. */
export async function shareTicketPdf(d: TicketData) {
  let blob: Blob;
  try {
    blob = await buildTicketPdf(d);
  } catch {
    notify("No pude generar el PDF. Intenta de nuevo.", "warning");
    return;
  }
  const file = new File([blob], `ticket-${d.code}.pdf`, { type: "application/pdf" });
  try {
    const nav = navigator as any;
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: `Ticket · ${d.title}` });
      return;
    }
  } catch {
    /* user cancelled or share unavailable — fall back to download */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ticket-${d.code}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  notify("Ticket guardado como PDF.");
}

export async function shareTicket(d: TicketData) {
  const text = [
    `🎟️ ${d.title}`,
    `${fullDate(d.date)} · ${d.time}`,
    d.peopleLabel,
    d.meetingPoint ? `📍 ${d.meetingPoint}` : "",
    `N° de registro: ${d.code}`,
    "Reserva con Akiles Travel",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    if (navigator.share) {
      await navigator.share({ title: `Ticket · ${d.title}`, text });
      return;
    }
    await navigator.clipboard.writeText(text);
    notify("Ticket copiado al portapapeles.");
  } catch {
    /* user cancelled the share sheet */
  }
}

/** Digital ticket (voyage style): cover, Akiles logo, details, barcode + code. */
export function Ticket({ data, className = "" }: { data: TicketData; className?: string }) {
  const isMapLink = !!data.meetingPoint && /^(https?:\/\/|www\.)/i.test(data.meetingPoint.trim());
  return (
    <div className={cn("overflow-hidden rounded-3xl border border-border bg-card shadow-sm", className)}>
      {/* Cover */}
      <div className="relative bg-ink">
        {data.coverImage ? (
          <ExperienceImage imageRef={data.coverImage} alt={data.title} className="h-28 w-full opacity-90" />
        ) : (
          <div className="h-16 w-full bg-gradient-to-r from-ink to-teal" />
        )}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-2.5">
          <Logo className="h-4 brightness-0 invert" />
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium shadow-sm",
              data.confirmed ? "bg-primary text-ink" : "bg-background/90 text-ink"
            )}
          >
            {data.confirmed ? "Confirmado" : "Pendiente"}
          </span>
        </div>
      </div>

      {/* Title card */}
      <div className="px-5 pt-4">
        <p className="font-display text-lg leading-tight text-teal">{data.title}</p>
        {data.tierName && <p className="mt-0.5 text-xs text-muted-foreground">{data.tierName}</p>}
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5">
        <Field label="Fecha" value={fullDate(data.date)} />
        <Field label="Hora" value={data.time} />
        {data.holderName && <Field label="Titular" value={data.holderName} />}
        <Field label="Pasajeros" value={data.peopleLabel} />
        {data.meetingPoint && (
          <Field
            label="Punto de encuentro"
            full
            value={
              isMapLink ? (
                <a
                  href={/^https?:\/\//i.test(data.meetingPoint) ? data.meetingPoint : `https://${data.meetingPoint}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-teal underline-offset-2 hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" /> Ver ubicación en el mapa
                </a>
              ) : (
                data.meetingPoint
              )
            }
          />
        )}
        {data.total != null && <Field label="Precio" value={formatUSD(data.total)} />}
      </div>

      {/* Perforated divider */}
      <div className="relative flex items-center">
        <span className="absolute -left-3 h-6 w-6 rounded-full bg-background" />
        <span className="absolute -right-3 h-6 w-6 rounded-full bg-background" />
        <div className="mx-5 flex-1 border-t-2 border-dashed border-border" />
      </div>

      {/* Barcode + code + share */}
      <div className="flex flex-col items-center gap-2 p-5">
        <Barcode code={data.code} />
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Número de registro</p>
          <p className="font-display text-xl tracking-[0.2em]">{data.code}</p>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => shareTicket(data)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
          >
            <Share2 className="h-4 w-4" /> Compartir
          </button>
          <button
            type="button"
            onClick={() => shareTicketPdf(data)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm transition hover:bg-accent"
          >
            <FileDown className="h-4 w-4" /> PDF
          </button>
          {data.whatsapp && (
            <a
              href={`https://wa.me/${data.whatsapp.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm transition hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
          {data.contactEmail && (
            <a
              href={`mailto:${data.contactEmail}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm transition hover:bg-accent"
            >
              <Mail className="h-4 w-4" /> Correo
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
