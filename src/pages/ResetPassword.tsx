import * as React from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { authUpdatePassword } from "@/lib/auth";
import { Sparkles, Check } from "lucide-react";

/** Reached from the password-reset email link. Supabase sets a recovery session
 *  from the URL automatically; here the user just sets a new password. */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await authUpdatePassword(password);
      if (res.error) setError(res.error);
      else setDone(true);
    } finally {
      setBusy(false);
    }
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
          {done ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-ink">
                <Check className="h-6 w-6" />
              </div>
              <h1 className="font-display text-2xl">Contraseña actualizada</h1>
              <p className="mt-1 text-sm text-muted-foreground">Ya puedes entrar con tu nueva contraseña.</p>
              <Button className="mt-4 w-full" onClick={() => navigate("/panel")}>
                Ir al panel
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-4 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-ink">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h1 className="font-display text-2xl">Nueva contraseña</h1>
                <p className="mt-1 text-sm text-muted-foreground">Elige una contraseña nueva para tu cuenta.</p>
              </div>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label>Contraseña</Label>
                  <PasswordInput
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "…" : "Guardar contraseña"}
                </Button>
              </form>
              <Link
                to="/auth"
                className="mt-4 block text-center text-sm text-muted-foreground hover:text-foreground"
              >
                ← Volver a entrar
              </Link>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
