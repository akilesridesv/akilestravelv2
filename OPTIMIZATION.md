# Optimización y arquitectura para escalar

Decisiones tomadas para que Akiles Travel v2 **no se ponga lento ni gaste caché** a medida que crece. Guía para mantener el sistema rápido.

## 1. Media (imágenes) — la fuente #1 de lentitud, resuelta

| Decisión | Por qué |
| --- | --- |
| **Compresión + resize en el cliente** antes de guardar (`lib/imageProcess.ts`): lado más largo ≤ 1600px, JPEG calidad 0.82 | Una foto de 5 MB queda en ~10–300 KB. Carga rápida y storage mínimo. |
| **Límite duro de 5 MB** en el archivo original | Evita subidas gigantes que traben el navegador. |
| **Blobs en IndexedDB, no en el estado** (`lib/imageStore.ts`) | El estado persistido (localStorage vía zustand) guarda solo refs `idb:<id>`. El JSON de estado se mantiene diminuto → hidratación instantánea, sin reventar el cuota de localStorage (~5 MB). |
| **Object URLs cacheados y revocados** | Cada blob genera un `objectURL` una sola vez (cache por ref) y se **revoca** al eliminar. Evita fugas de memoria — la causa típica de que una SPA "se ponga lenta con el uso". |
| **`loading="lazy"` en imágenes** | El navegador no descarga lo que no está en pantalla. |

**Al migrar a Supabase:** los refs pasan a URLs de Supabase Storage y `resolveImageSrc` las devuelve tal cual (sin tocar la UI). Usar las **transformaciones de imagen de Supabase** (`?width=` / `?quality=`) para servir thumbnails y `srcset` responsivo desde el CDN.

## 2. Estado de la app

- **Zustand con selectores finos** (`useApp(s => s.experiences)`): cada componente se re-renderiza solo cuando cambia su porción, no ante cualquier cambio global.
- **Persistencia mínima**: solo datos ligeros (experiencias, reservas, refs). Nada binario.
- El copiloto y los paneles **comparten el mismo store** → una edición por chat y una manual son la misma acción; no hay estados duplicados que sincronizar.

## 3. Bundle y carga inicial

- **Code-splitting por ruta** (`React.lazy` en `App.tsx`): la landing carga con el bundle mínimo; Auth y Dashboard se cargan bajo demanda.
- Íconos por import individual (`lucide-react`) → tree-shaking, no se empaqueta todo el set.
- Objetivo: mantener el chunk inicial pequeño; medir con `npm run build` (hoy ~135 KB gzip).

## 4. Arquitectura de consultas (cuando entre Supabase/Postgres)

Reglas para que las consultas escalen a miles de experiencias/reservas:

1. **Índices** en toda columna de filtro/orden: `activities(publication_status, is_active)`, `activities(city)`, `availability_slots(activity_id, slot_date)`, `bookings(provider_profile_id, booking_status)`, `bookings(activity_id, scheduled_date)`.
2. **Seleccionar solo columnas necesarias** (`select('id,title,price_per_person,featured_image')`), nunca `select('*')` en listados.
3. **Paginación / scroll infinito** con `range()` — nunca traer toda la tabla. Listados de descubrimiento con keyset pagination (por `created_at`/`id`), no `offset` grande.
4. **Evitar N+1**: traer experiencia + sus schedules/tiers/imágenes en un solo query con joins/embeds de Supabase, no un query por fila.
5. **Agregados en el servidor** (ingresos, "qué vende más") vía RPC/funciones SQL `SECURITY DEFINER`, no trayendo todas las reservas al cliente para sumar.
6. **Disponibilidad materializada** (patrón de v1): `recurring_schedules → availability_slots` en ventana móvil de 90 días, mantenido por cron. Consultar slots concretos es un simple filtro por fecha, no un cálculo en vivo.
7. **RLS como frontera de seguridad**, con funciones helper (`has_role`) evaluadas server-side; el proveedor solo lee sus filas.
8. **Validación en la última capa** (triggers de capacidad/corte) para que la concurrencia no sobreviva ni con reintentos.

## 5. Caché de datos (al agregar fetching)

- Usar React Query (o SWR) con `staleTime` razonable para descubrimiento; invalidar por mutación puntual, no recargar todo.
- **Debounce** en búsqueda (≥150 ms) y en el guardado de calendario por lote.
- Cachear traducciones de contenido dinámico en `localStorage` con TTL (patrón de v1), no re-traducir en cada render.

## 6. Qué vigilar (síntomas de degradación)

- Crecimiento de memoria al navegar mucho → object URLs sin revocar (ya mitigado).
- `localStorage` acercándose a 5 MB → algo binario se está colando al estado (debe ir a IndexedDB/Storage).
- Listados que tardan → falta índice o se está haciendo `select('*')` / N+1.
- Bundle inicial creciendo → mover rutas/paneles pesados a `React.lazy`.
