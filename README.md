# Akiles Travel v2 — AI-Native

Marketplace de experiencias de viaje curadas en El Salvador, con una interfaz **nativa de IA**: el proveedor le *habla* a su negocio y la UI correcta aparece sola. No es un dashboard con un chatbot pegado — es "lo que los LLM hicieron por la búsqueda", aplicado a reservar y gestionar experiencias.

Estamos construyendo primero el **lado proveedor** (un copiloto de negocio para vender en minutos). El lado turista (concierge de descubrimiento y reserva) viene después.

## Stack

- **React 18 + Vite 5 + TypeScript**
- **Tailwind CSS** (tokens semánticos) + primitivos estilo shadcn/ui
- **Zustand** para estado compartido (el mismo estado que ven el copiloto y los paneles directos)
- **Supabase** (auth + Postgres) — opcional en local; sin llaves corre 100% sobre `localStorage`
- Extracción por lenguaje natural: parser heurístico en español hoy, listo para un LLM vía proxy

## Correr en local

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Funciona sin backend (modo local). Para conectar Supabase / un LLM real, copia `.env.example` a `.env.local` y llena las variables.

## Qué está construido (Fase 1)

- **Landing** con la propuesta de valor "vende en minutos".
- **Auth de proveedor** (mock local; listo para Supabase Auth).
- **Dashboard Copiloto** con split view en desktop (conversación + paneles) y navegación conversación-first en móvil.
- **Vender en minutos**: el proveedor describe su experiencia en una frase → el copiloto extrae y renderiza una **ficha editable** → publica como `pending_review`.
- **Paneles directos**: Experiencias, Calendario, Reservas (aprobar/rechazar), Ingresos.

## Arquitectura (dónde está cada cosa)

| Dominio | Archivos |
| --- | --- |
| Estado compartido | `src/state/store.ts` |
| Modelo de dominio | `src/types/domain.ts` |
| Extracción NL → ficha | `src/ai/extractExperience.ts`, `src/ai/intent.ts` |
| Copiloto (superficie + bloques estructurados) | `src/components/copilot/CopilotSurface.tsx` |
| Ficha editable | `src/components/provider/ExperienceDraftEditor.tsx` |
| Paneles directos | `src/components/provider/panels.tsx` |
| Páginas | `src/pages/{Landing,Auth,ProviderDashboard}.tsx` |
| Backend opcional | `src/lib/supabase.ts` |

## Principio de diseño (no negociable)

La IA **no** genera UI arbitraria: selecciona de un **registro de componentes** conocidos (ficha, lista, reservas, ingresos, confirmación). El sistema de diseño manda sobre estilos. La UI directa siempre está disponible: puedes *decírselo* o *tocarlo*, sobre el mismo estado.

## Roadmap

1. ✅ Foundation + copiloto proveedor + vender en minutos
2. Calendario en lenguaje natural (abrir/bloquear salidas en lote)
3. Reservas conversacionales (aprobar/cobrar por lenguaje natural)
4. Inteligencia de negocio (ingresos, qué vende más)
5. Curaduría (cola de revisión admin)
6. Lado turista: concierge de descubrimiento y reserva

---
El Salvador · USD · ES/EN
