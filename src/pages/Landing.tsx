import * as React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, Clock, ShieldCheck, MessageSquare, ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-dvh bg-background">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-lg text-ink">
            A
          </div>
          <span className="font-display text-xl">Akiles Travel</span>
        </div>
        <Link to="/auth">
          <Button variant="outline" size="sm">
            Entrar
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-8 sm:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            El primer marketplace de experiencias con copiloto de IA
          </div>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight sm:text-6xl">
            Vende tus experiencias de viaje{" "}
            <span className="bg-primary/50 px-2">en minutos</span>, no en horas.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Descríbele tu experiencia a tu copiloto y él la publica por ti. Gestiona salidas,
            reservas e ingresos hablándole a tu negocio — la interfaz de la era de la IA.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/auth">
              <Button size="lg">
                Empieza a vender <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <span className="text-sm text-muted-foreground">
              Curado y verificado para El Salvador 🇸🇻
            </span>
          </div>
        </div>

        {/* Demo prompt card */}
        <Card className="mx-auto mt-14 max-w-2xl overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4 text-primary" /> Tu copiloto de negocio
          </div>
          <div className="space-y-3 p-4">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-background">
                Tour de café en Ataco, 3 horas, $35 por persona, salidas martes y jueves 9am, máximo 8
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Sparkles className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Entendí <b>“Tour de café en Ataco”</b> a $35/persona, 3h, salidas mar y jue 9:00 —
                aquí está tu ficha lista para publicar. ✨
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Value props */}
      <section className="mx-auto grid max-w-5xl gap-4 px-6 py-12 sm:grid-cols-3">
        <Feature
          icon={<Clock className="h-6 w-6" />}
          title="Publica hablando"
          body="Sin formularios eternos. Describe tu experiencia en una frase y el copiloto arma la ficha."
        />
        <Feature
          icon={<MessageSquare className="h-6 w-6" />}
          title="Gestiona conversando"
          body="Calendario, reservas e ingresos: pregúntale a tu negocio, o tócalo directo. Tú decides."
        />
        <Feature
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Curado y confiable"
          body="Cada experiencia se verifica antes de publicarse. Calidad garantizada para el turista."
        />
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Akiles Travel · El Salvador · Hecho con propósito
      </footer>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 text-ink">
        {icon}
      </div>
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </Card>
  );
}
