-- 0006_llm_proxy.sql
-- LLM proxy INSIDE Postgres (no CLI, no Edge Function needed).
-- Keeps the Gemini API key in Vault and calls Gemini from a security-definer
-- function. The browser calls it via supabase.rpc('llm_generate', { payload }).
-- Only signed-in (authenticated) users can run it — never anon.
--
-- HOW TO USE:
--   1) Get a Gemini key: https://aistudio.google.com/apikey
--   2) Replace PEGA_TU_API_KEY_AQUI below with that key.
--   3) Paste this whole file into the Supabase SQL editor and Run.

-- 1) HTTP extension (synchronous outbound requests)
create extension if not exists http with schema extensions;

-- 2) Store the Gemini API key in Vault (idempotent).
do $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'gemini_api_key';
  if v_id is null then
    perform vault.create_secret('PEGA_TU_API_KEY_AQUI', 'gemini_api_key');
  else
    perform vault.update_secret(v_id, 'PEGA_TU_API_KEY_AQUI');
  end if;
end $$;

-- 3) The proxy function: takes Gemini's request payload, adds it the key, returns
--    Gemini's raw JSON response.
create or replace function public.llm_generate(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, vault
set statement_timeout to '25s'   -- cap the wait; client falls back fast on timeout
as $$
declare
  api_key text;
  -- gemini-3.6-flash free tier is only 20 requests/DAY; the -lite model has a
  -- much higher free quota. For production traffic, enable billing on the key.
  model   text := 'gemini-3.5-flash-lite';
  body    jsonb;
  resp    jsonb;
begin
  select decrypted_secret into api_key
  from vault.decrypted_secrets
  where name = 'gemini_api_key'
  limit 1;

  -- NOTE: do NOT add a check against the literal key here — a find/replace of the
  -- placeholder above would also replace it and break the function.
  if api_key is null then
    raise exception 'Falta la Gemini API key en Vault (gemini_api_key).';
  end if;

  body := payload
    || jsonb_build_object(
         'toolConfig',       coalesce(payload->'toolConfig',       '{"functionCallingConfig":{"mode":"AUTO"}}'::jsonb),
         'generationConfig', coalesce(payload->'generationConfig', '{"temperature":0.4}'::jsonb)
       );

  perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS', '5000');
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '20000');

  select content::jsonb into resp
  from extensions.http((
    'POST',
    'https://generativelanguage.googleapis.com/v1beta/models/' || model || ':generateContent',
    array[extensions.http_header('x-goog-api-key', api_key)],
    'application/json',
    body::text
  )::extensions.http_request);

  return resp;
end;
$$;

-- 4) Permissions: only authenticated providers may call it.
revoke all on function public.llm_generate(jsonb) from public;
-- authenticated = provider copilot; anon = tourist concierge (public marketplace).
grant execute on function public.llm_generate(jsonb) to authenticated, anon;
