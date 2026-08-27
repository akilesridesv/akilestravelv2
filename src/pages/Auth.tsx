import * as React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { isSupabaseConfigured } from "@/lib/supabase";
import { authSignIn, authSignUp, authGoogle } from "@/lib/auth";
import { Sparkles } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const remote = isSupabaseConfigured;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res =
        mode === "register"
          ? await authSignUp(email.trim(), password, name.trim())
          : await authSignIn(email.trim(), password, name.trim());
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.needsConfirm) {
        setNotice("Te enviamos un correo para confirmar tu cuenta. Confírmalo y vuelve a entrar.");
        setMode("login");
        return;
      }
      navigate("/panel");
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === "register";

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
            <h1 className="font-display text-2xl">
              {isRegister ? "Crea tu cuenta" : "Entra a tu copiloto"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gestiona tu negocio de experiencias y empieza a vender.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {(isRegister || !remote) && (
              <div>
                <Label>Nombre del negocio</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Café Tours Ataco"
                />
              </div>
            )}
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
            {remote && (
              <div>
                <Label>Contraseña</Label>
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {notice && <p className="text-sm text-emerald-700">{notice}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "…" : isRegister ? "Crear cuenta" : "Entrar"}
            </Button>
          </form>

          {remote && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="w-full" onClick={() => authGoogle()}>
                Continuar con Google
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMode(isRegister ? "login" : "register");
                  setError(null);
                  setNotice(null);
                }}
                className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {isRegister ? "¿Ya tienes cuenta? Entra" : "¿No tienes cuenta? Regístrate"}
              </button>
            </>
          )}

          {!remote && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Modo local (sin backend). Conecta Supabase en <code>.env.local</code> para auth real.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
