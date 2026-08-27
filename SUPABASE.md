# Conectar Supabase real

El código está listo para usar Supabase en cuanto configures dos variables. Sin
ellas, la app sigue corriendo 100% local (localStorage + IndexedDB). Estos pasos
te toman ~5 minutos.

## 1. Crea el proyecto
1. Entra a https://supabase.com → **New project**.
2. Nombre: `akiles-travel`. Región: la más cercana (ej. East US). Elige una
   contraseña de base de datos y guárdala.
3. Espera a que termine de aprovisionar (~1-2 min).

## 2. Corre la migración (crea las tablas + RLS + storage)
1. En el proyecto → **SQL Editor** → **New query**.
2. Pega TODO el contenido de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) y dale **Run**.
3. Debe decir "Success". (Crea: profiles, provider_profiles, activities,
   recurring_schedules, date_slots, ticket_tiers, bookings, RLS y el bucket
   `experience-images`.)

## 3. Copia las llaves (públicas — seguras de compartir)
En **Project Settings → API**:
- **Project URL** → `https://xxxx.supabase.co`
- **anon public** key → un JWT largo que empieza con `eyJ...`

> ⚠️ NO compartas la **service_role** key. Solo necesito Project URL y anon.

## 4. (Opcional) Login con Google
En **Authentication → Providers → Google**: actívalo y pega tu Client ID/Secret
de Google Cloud. Si lo dejas apagado, funciona el login por email + contraseña.

En **Authentication → URL Configuration**, agrega tu URL de redirección
(`http://localhost:5173` para desarrollo).

## 5. Dámelas
Pégame aquí en el chat:
```
URL:  https://xxxx.supabase.co
ANON: eyJhbGciOi...
```
Yo las pongo en `.env.local`, activo auth + datos + storage reales, y probamos
juntos que:
- el registro/login cree tu perfil,
- crear una experiencia la guarde en la base de datos,
- las imágenes suban al bucket,
- las reservas persistan.

## Qué queda del lado del código (ya preparado)
- `src/lib/supabase.ts` — cliente (se activa solo cuando existen las variables).
- Auth, capa de datos e imágenes se conectan a Supabase cuando está configurado;
  local es el fallback.
