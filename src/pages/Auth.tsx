import * as React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "@/state/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Sparkles } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const signIn = useApp((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    // Local mock auth. When Supabase is configured, wire supabase.auth here.
    signIn(email.trim(), name.trim());
    navigate("/panel");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-secondary/40 px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-display text-lg text-ink">
            A
          </div>
          <span className="font-display text-xl">Akiles Travel</span>
        </Link>

        <Card className="p-6">
          <div className="mb-4 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-ink">
              <Sparkles className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl">Entra a tu copiloto</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gestiona tu negocio de experiencias y empieza a vender.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Nombre del negocio</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Café Tours Ataco"
              />
            </div>
            <div>
              <Label>Correo</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
              />
            </div>
            <Button type="submit" className="w-full">
              Continuar
            </Button>
          </form>

          {!isSupabaseConfigured && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Modo local (sin backend). Conecta Supabase en <code>.env.local</code> para auth real.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
