import * as React from "react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/state/store";
import { authSignOut } from "@/lib/auth";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { CopilotSurface } from "@/components/copilot/CopilotSurface";
import {
  ExperiencesPanel,
  BookingsPanel,
  RevenuePanel,
  CalendarPanel,
} from "@/components/provider/panels";
import { ProfilePanel } from "@/components/provider/ProfilePanel";
import { Badge } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  LayoutGrid,
  CalendarDays,
  Inbox,
  TrendingUp,
  BadgeCheck,
  Clock3,
  LogOut,
  User,
} from "lucide-react";

type Panel = "experiences" | "calendar" | "bookings" | "revenue" | "profile";

const PANEL_TABS: { key: Panel; label: string; icon: React.ReactNode }[] = [
  { key: "experiences", label: "Experiencias", icon: <LayoutGrid className="h-4 w-4" /> },
  { key: "calendar", label: "Calendario", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "bookings", label: "Reservas", icon: <Inbox className="h-4 w-4" /> },
  { key: "revenue", label: "Ingresos", icon: <TrendingUp className="h-4 w-4" /> },
  { key: "profile", label: "Perfil", icon: <User className="h-4 w-4" /> },
];

export default function ProviderDashboard() {
  const navigate = useNavigate();
  const user = useApp((s) => s.user);
  const provider = useApp((s) => s.provider);
  const authReady = useApp((s) => s.authReady);
  const isDesktop = useIsDesktop();
  const [activePanel, setActivePanel] = useState<Panel>("experiences");
  const [page, setPage] = useState<0 | 1>(0); // mobile pager: 0 = chat, 1 = panel
  const pagerRef = useRef<HTMLDivElement>(null);

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) {
    navigate("/auth");
    return null;
  }

  function scrollToPage(i: 0 | 1) {
    const el = pagerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setPage(i);
  }

  // Open a panel: on desktop just swap the right pane; on mobile slide to it.
  function goToPanel(p: Panel) {
    setActivePanel(p);
    if (!isDesktop) scrollToPage(1);
  }

  function onPagerScroll() {
    const el = pagerRef.current;
    if (!el) return;
    const p = Math.round(el.scrollLeft / el.clientWidth) as 0 | 1;
    if (p !== page) setPage(p);
  }

  function renderPanel(p: Panel) {
    switch (p) {
      case "experiences":
        return <ExperiencesPanel />;
      case "calendar":
        return <CalendarPanel />;
      case "bookings":
        return <BookingsPanel />;
      case "revenue":
        return <RevenuePanel />;
      case "profile":
        return <ProfilePanel />;
    }
  }

  const copilot = <CopilotSurface onNavigate={(t) => goToPanel(t as Panel)} context={activePanel} />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <button
          onClick={() => goToPanel("profile")}
          className="flex min-w-0 items-center gap-3 rounded-xl text-left transition hover:opacity-80"
          aria-label="Ver mi perfil"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-lg text-ink">
            {(provider?.business_name ?? "A").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-tight">
              {provider?.business_name ?? "Mi negocio"}
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {provider?.verification_status === "approved" ? (
                <Badge tone="success">
                  <BadgeCheck className="h-3 w-3" /> Verificado
                </Badge>
              ) : (
                <Badge tone="warning">
                  <Clock3 className="h-3 w-3" /> Verificación pendiente
                </Badge>
              )}
            </div>
          </div>
        </button>
        <button
          onClick={async () => {
            await authSignOut();
            navigate("/");
          }}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-accent"
        >
          <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Salir</span>
        </button>
      </header>

      {isDesktop ? (
        /* Desktop: chat left, panel right */
        <div className="grid min-h-0 flex-1 grid-cols-[1.15fr_0.85fr]">
          <section className="flex min-h-0 flex-col">{copilot}</section>
          <aside className="flex min-h-0 flex-col border-l border-border bg-secondary/40">
            <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
              {PANEL_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActivePanel(t.key)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition",
                    activePanel === t.key ? "bg-ink text-background" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">{renderPanel(activePanel)}</div>
          </aside>
        </div>
      ) : (
        /* Mobile: swipe between chat (left) and the dashboard panel (right) */
        <>
          <div
            ref={pagerRef}
            onScroll={onPagerScroll}
            className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
            style={{ scrollbarWidth: "none" }}
          >
            <section className="flex min-h-0 w-full shrink-0 snap-start flex-col overflow-hidden">
              {copilot}
            </section>
            <section className="flex min-h-0 w-full shrink-0 snap-start flex-col overflow-hidden bg-secondary/40">
              <div className="flex-1 overflow-y-auto p-4">{renderPanel(activePanel)}</div>
            </section>
          </div>

          {/* Bottom nav: Chat + the panels */}
          <nav className="safe-b grid shrink-0 grid-cols-6 border-t border-border bg-background">
            <MobileTab
              label="Chat"
              icon={<MessageSquare className="h-5 w-5" />}
              active={page === 0}
              onClick={() => scrollToPage(0)}
            />
            {PANEL_TABS.map((t) => (
              <MobileTab
                key={t.key}
                label={t.label}
                icon={t.icon}
                active={page === 1 && activePanel === t.key}
                onClick={() => goToPanel(t.key)}
              />
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

function MobileTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px]",
        active ? "text-ink" : "text-muted-foreground"
      )}
    >
      <span className={cn(active && "text-primary")}>{icon}</span>
      {label}
    </button>
  );
}
