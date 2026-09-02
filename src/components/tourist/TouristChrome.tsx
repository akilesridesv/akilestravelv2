import { Link } from "react-router-dom";
import { BadgeCheck, ChevronLeft, UserRound } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useApp } from "@/state/store";
import { cn } from "@/lib/utils";

/** Consistent "back" pill used across tourist pages (bordered, subtle blur). */
export function BackLink({
  to = "/",
  label = "Explorar",
  className = "",
}: {
  to?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-background/85 px-3.5 py-1.5 text-sm font-medium shadow-sm backdrop-blur transition hover:bg-accent",
        className
      )}
    >
      <ChevronLeft className="h-4 w-4" /> {label}
    </Link>
  );
}

/** Minimal top bar for the tourist marketplace. */
export function TouristHeader() {
  const user = useApp((s) => s.user);
  const role = useApp((s) => s.role);
  const isTourist = !!user && role === "tourist";
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Link to="/" className="flex items-center gap-1.5">
          <Logo className="h-6" />
          <span className="font-display text-base font-semibold lowercase tracking-tight text-muted-foreground">
            travel
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/vender"
            className="hidden rounded-full border border-border px-4 py-1.5 text-sm font-medium transition hover:bg-accent sm:inline-block"
          >
            Publica tu experiencia
          </Link>
          {isTourist ? (
            <Link
              to="/cuenta"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              <UserRound className="h-4 w-4" /> Mi cuenta
            </Link>
          ) : (
            <Link
              to="/auth?role=tourist"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm font-medium transition hover:bg-accent"
            >
              <UserRound className="h-4 w-4" /> Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function TouristFooter() {
  return (
    <footer className="mt-20 border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 py-10 text-center text-sm text-muted-foreground sm:px-8">
        <div className="flex items-center gap-1.5">
          <Logo className="h-5" />
          <span className="font-display text-sm font-semibold lowercase text-muted-foreground">travel</span>
        </div>
        <p>Experiencias curadas y verificadas en El Salvador 🇸🇻</p>
        <Link to="/vender" className="underline underline-offset-4 hover:text-foreground">
          ¿Tienes una experiencia? Publícala
        </Link>
      </div>
    </footer>
  );
}

/** Trust seal shown wherever a provider is verified. */
export function VerifiedTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-ink shadow-sm backdrop-blur " +
        className
      }
    >
      <BadgeCheck className="h-3.5 w-3.5 text-primary" /> Verificado
    </span>
  );
}
