import * as React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/state/store";
import { CopilotSurface } from "@/components/copilot/CopilotSurface";
import {
  ExperiencesPanel,
  BookingsPanel,
  RevenuePanel,
  CalendarPanel,
} from "@/components/provider/panels";
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
} from "lucide-react";

type Panel = "experiences" | "calendar" | "bookings" | "revenue";
type View = "copilot" | Panel;

const PANEL_TABS: { key: Panel; label: string; icon: React.ReactNode }[] = [
  { key: "experiences", label: "Experiencias", icon: <LayoutGrid className="h-4 w-4" /> },
  { key: "calendar", label: "Calendario", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "bookings", label: "Reservas", icon: <Inbox className="h-4 w-4" /> },
  { key: "revenue", label: "Ingresos", icon: <TrendingUp className="h-4 w-4" /> },
];

export default function ProviderDashboard() {
  const navigate = useNavigate();
  const user = useApp((s) => s.user);
  const provider = useApp((s) => s.provider);
  const signOut = useApp((s) => s.signOut);
  const [view, setView] = useState<View>("copilot");

  if (!user) {
    navigate("/auth");
    return null;
  }

  const activePanel: Panel = view === "copilot" ? "experiences" : view;

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
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-lg text-ink">
          A
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
        <button
          onClick={() => {
            signOut();
            navigate("/");
          }}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-accent"
        >
          <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Salir</span>
        </button>
      </header>

      {/* Body: split on desktop, single view on mobile */}
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[1.15fr_0.85fr]">
        {/* Copilot */}
        <section
          className={cn(
            "min-h-0 flex-col",
            view === "copilot" ? "flex" : "hidden",
            "lg:flex"
          )}
        >
          <CopilotSurface onNavigate={(t) => setView(t as View)} />
        </section>

        {/* Context panels */}
        <aside
          className={cn(
            "min-h-0 flex-col border-l border-border bg-secondary/40",
            view !== "copilot" ? "flex" : "hidden",
            "lg:flex"
          )}
        >
          <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
            {PANEL_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition",
                  activePanel === t.key
                    ? "bg-ink text-background"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">{renderPanel(activePanel)}</div>
        </aside>
      </div>

      {/* Mobile bottom nav */}
      <nav className="safe-b grid grid-cols-5 border-t border-border bg-background lg:hidden">
        <MobileTab
          label="Copiloto"
          icon={<MessageSquare className="h-5 w-5" />}
          active={view === "copilot"}
          onClick={() => setView("copilot")}
        />
        {PANEL_TABS.map((t) => (
          <MobileTab
            key={t.key}
            label={t.label}
            icon={t.icon}
            active={view === t.key}
            onClick={() => setView(t.key)}
          />
        ))}
      </nav>
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
