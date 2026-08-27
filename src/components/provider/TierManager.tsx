import type { TicketTier } from "@/types/domain";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { uid } from "@/lib/utils";
import { Plus, Trash2, Ticket } from "lucide-react";

/**
 * Manage custom ticket tiers (Entrada regular, Entrada VIP, …). Each tier has a
 * name, a price, and a short legend describing what it additionally includes.
 * Tiers are optional; without them the experience uses its base price.
 */
export function TierManager({
  value,
  onChange,
}: {
  value: TicketTier[];
  onChange: (tiers: TicketTier[]) => void;
}) {
  function add() {
    onChange([
      ...value,
      { id: uid("tier"), tier_name: "", description: "", price: 0, quantity_available: 0, quantity_sold: 0 },
    ]);
  }
  function update(id: string, patch: Partial<TicketTier>) {
    onChange(value.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }
  function remove(id: string) {
    onChange(value.filter((t) => t.id !== id));
  }

  return (
    <div className="grid gap-2">
      {value.map((t) => (
        <div key={t.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 gap-2">
              <div className="flex flex-wrap gap-2">
                <Input
                  className="h-9 min-w-0 flex-1"
                  placeholder="Nombre (ej. Entrada VIP)"
                  value={t.tier_name}
                  onChange={(e) => update(t.id, { tier_name: e.target.value })}
                />
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    className="h-9 w-24"
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={t.price || ""}
                    onChange={(e) => update(t.id, { price: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <Textarea
                className="min-h-[44px] text-sm"
                rows={1}
                placeholder="¿Qué incluye adicional? (ej. bebida de bienvenida y asiento preferente)"
                value={t.description ?? ""}
                onChange={(e) => update(t.id, { description: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Quitar tier"
              className="mt-1 rounded-full p-1.5 text-muted-foreground hover:bg-accent"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={add}>
        <Plus className="h-4 w-4" /> Agregar tier
      </Button>

      {value.length === 0 && (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Ticket className="h-3.5 w-3.5" /> Opcional. Sin tiers se usa el precio base por persona.
        </p>
      )}
    </div>
  );
}
